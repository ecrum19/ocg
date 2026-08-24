#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import { rdfParser } from "rdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const CLI_ARGS = process.argv.slice(2);
const PROJECT_ROOT = path.resolve(
  getOptionValue(CLI_ARGS, "--project-root") || process.env.OCG_PROJECT_ROOT || process.cwd()
);
const CONFIG_PATH = resolveProjectPath(
  getOptionValue(CLI_ARGS, "--config") || "ocg.config.json"
);
const CONFIG_SCHEMA_TEMPLATE_PATH = path.join(PACKAGE_ROOT, "ocg.config.schema.json");
const PROJECT_SCHEMA_PATH = path.join(PROJECT_ROOT, "ocg.config.schema.json");
const PACKAGE_PATH = path.join(PACKAGE_ROOT, "package.json");
const WORKFLOW_TEMPLATE_PATH = path.join(PACKAGE_ROOT, ".github", "workflows", "publish-pages.yml");
const PROJECT_WORKFLOW_PATH = path.join(PROJECT_ROOT, ".github", "workflows", "publish-pages.yml");
const SOURCE_GUIDE_TEMPLATE_PATH = path.join(PACKAGE_ROOT, "source", "README-source-guide.txt");
const PROJECT_SOURCE_GUIDE_PATH = path.join(PROJECT_ROOT, "source", "README-source-guide.txt");
const FAVICON_PNG_TEMPLATE_PATH = path.join(PACKAGE_ROOT, "source", "branding", "favicon.png");
const FAVICON_ICO_TEMPLATE_PATH = path.join(PACKAGE_ROOT, "source", "branding", "favicon.ico");
const FAVICON_PNG_PROJECT_PATH = path.join(PROJECT_ROOT, "source", "branding", "favicon.png");
const FAVICON_ICO_PROJECT_PATH = path.join(PROJECT_ROOT, "source", "branding", "favicon.ico");
const SITE_DIR = resolveProjectPath(getOptionValue(CLI_ARGS, "--output") || "site");
const ASSETS_DIR = path.join(SITE_DIR, "assets");
const VENDOR_ASSETS_DIR = path.join(ASSETS_DIR, "vendor");
const TERMS_DIR = path.join(SITE_DIR, "terms");
const OCG_VERSION = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8")).version || "development";
const GRAPH_VENDOR_ASSETS = [
  {
    sourcePath: resolveDependencyAsset("graphology/dist/graphology.umd.min.js"),
    destinationName: "graphology.umd.min.js"
  },
  {
    sourcePath: resolveDependencyAsset("sigma/build/sigma.min.js"),
    destinationName: "sigma.min.js"
  }
];

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
const RDFS_SUBCLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
const SKOS_PREF_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";
const SKOS_DEFINITION = "http://www.w3.org/2004/02/skos/core#definition";
const SKOS_BROADER = "http://www.w3.org/2004/02/skos/core#broader";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const OWL_OBJECT_PROPERTY = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATATYPE_PROPERTY = "http://www.w3.org/2002/07/owl#DatatypeProperty";
const OWL_ANNOTATION_PROPERTY = "http://www.w3.org/2002/07/owl#AnnotationProperty";
const SKOS_CONCEPT = "http://www.w3.org/2004/02/skos/core#Concept";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const DEFAULT_FEATURES = {
  referencePage: true,
  graphPage: true,
  termPages: true,
  rawViewer: true,
  overviewCards: true,
  hierarchyAsset: true,
  hierarchyOverview: false,
  specPage: false,
  usageGuidePage: true
};

const DEFAULT_HIERARCHY = {
  title: "Ontology Structure",
  description: "A curated overview of the main class and concept relationships in this ontology.",
  termTypes: ["class", "concept"],
  relations: ["subClassOf", "broader"],
  rootTerms: [],
  maxRoots: 6,
  maxDepth: 3,
  maxChildrenPerNode: 6,
  maxNodes: 36,
  includeLeafTerms: true,
  includeExternal: false,
  includePropertyRelations: true,
  propertyRelations: ["domain", "range"],
  maxPropertyRelations: 12,
  labelMode: "label-and-qname"
};

const DEFAULT_GRAPH = {
  defaultView: "custom",
  custom: {
    enabled: true,
    label: "Ontology Network",
    defaultMode: "predicate-nodes",
    modes: {
      predicateNodes: true,
      predicateEdges: true
    },
    layout: {
      iterations: 320,
      seed: 42,
      scalingRatio: 1.4,
      gravity: 1,
      linLogMode: false,
      preventOverlap: true,
      labelSpacing: 1.15
    },
    labels: {
      density: 1.5,
      gridCellSize: 90,
      renderedSizeThreshold: 2,
      forceAllUnder: 80
    }
  },
  webvowl: {
    enabled: false,
    serviceUrl: "https://service.tib.eu/webvowl/",
    ontologyUrl: "",
    height: 760
  },
  colors: {
    class: "#b7dcf6",
    objectProperty: "#bee7c3",
    datatypeProperty: "#f7d7ab",
    annotationProperty: "#f2c8cf",
    concept: "#d3c5f6",
    declaredTerm: "#e1e8ef",
    external: "#dfe6ee",
    subClassOf: "#1f6f92",
    domain: "#2f8040",
    range: "#ab6b22",
    broader: "#7b5ca7"
  }
};

const SUPPORTED_ONTOLOGY_FORMATS = {
  turtle: { contentType: "text/turtle", extensions: [".ttl", ".turtle"] },
  rdfxml: { contentType: "application/rdf+xml", extensions: [".rdf", ".rdfxml", ".owl"] },
  jsonld: { contentType: "application/ld+json", extensions: [".jsonld"] },
  ntriples: { contentType: "application/n-triples", extensions: [".nt", ".ntriples"] }
};
const SUPPORTED_ONTOLOGY_FORMAT_NAMES = Object.keys(SUPPORTED_ONTOLOGY_FORMATS);
const VIEWER_ASSET_KINDS = new Set(["ontology", "shapes", "shex", "spec", "example", "artifact"]);

const DEFAULT_THEME = {
  fonts: {
    heading: "Space Grotesk",
    body: "IBM Plex Sans",
    mono: "IBM Plex Mono"
  },
  colors: {
    pageBackground: "#f6f1ea",
    pageBackgroundAlt: "#edf3f7",
    panelBackground: "#ffffff",
    cardBackground: "#ffffff",
    text: "#1d1f22",
    mutedText: "#5f6b7a",
    accent: "#1f6f78",
    accentStrong: "#13535a",
    border: "#d6dee6"
  }
};

const DEFAULT_SITE = {
  basePath: "/",
  hero: {
    kicker: "",
    headline: "",
    body: ""
  },
  resourcePanel: {
    title: "Published Artifacts",
    body: "Generated outputs for the configured ontology package."
  },
  toc: {
    enabled: true,
    title: "On this page"
  },
  home: {
    actions: {
      reference: "Vocabulary Reference",
      graph: "Graph View",
      terms: "Terms",
      specification: "Specification",
      ontology: "OWL Ontology",
      shapes: "SHACL",
      shex: "ShEx"
    },
    metadata: {
      canonicalUri: "Canonical URI",
      version: "Version",
      maintainer: "Maintainer",
      unspecified: "Unspecified",
      copyNamespace: "Copy namespace",
      namespaceCopied: "Namespace copied",
      namespaceCopyUnavailable: "Namespace copy unavailable"
    },
    snapshot: {
      title: "Ontology Snapshot",
      body: "A summary of the configured ontology."
    },
    overview: {
      title: "Repository Workflow",
      body: "Configure these cards with onboarding, publication, or other project guidance."
    },
    featuredTerms: {
      title: "Featured Terms",
      body: "Important ontology terms selected for this landing page.",
      emptyBody: "No featured terms are currently configured."
    },
    examples: {
      title: "Examples",
      body: "Configured example files for this ontology.",
      defaultDescription: "Example artifact configured for the site.",
      linkText: "Example"
    },
    viewer: {
      title: "Artifact Viewer",
      body: "Configured source artifacts available in this companion site.",
      viewFileText: "View File",
      loadingText: "Loading..."
    },
    artifacts: {
      ontologyLabel: "OWL Ontology",
      ontologyDescription: "Primary ontology source configured for the site.",
      shapesLabel: "SHACL Shapes",
      shapesDescription: "Optional SHACL constraints package.",
      shexLabel: "ShEx Schema",
      shexDescription: "Optional ShEx schema file.",
      specificationLabel: "Specification Source",
      specificationDescription: "Source document for the optional ReSpec specification page.",
      additionalArtifactDescription: "Additional configured source artifact."
    }
  },
  overviewCards: [],
  customSections: [],
  footer: {
    primary: "",
    secondary: ""
  },
  generator: {
    repositoryUrl: "",
    documentationUrl: ""
  }
};

const TERM_TYPE_INFO = {
  class: { label: "Class", badge: "Class", color: "#d9eef7" },
  objectProperty: { label: "Object Property", badge: "Object Property", color: "#ddefdd" },
  datatypeProperty: { label: "Datatype Property", badge: "Datatype Property", color: "#f4e3cf" },
  annotationProperty: { label: "Annotation Property", badge: "Annotation Property", color: "#f0d8da" },
  concept: { label: "Concept", badge: "Concept", color: "#e7dcf3" },
  declaredTerm: { label: "Declared Term", badge: "Declared Term", color: "#e7edf3" },
  external: { label: "External Reference", badge: "External", color: "#e7edf3" }
};

const TERM_TYPE_ORDER = [
  "class",
  "objectProperty",
  "datatypeProperty",
  "annotationProperty",
  "concept",
  "declaredTerm",
  "external"
];

const RELATION_INFO = {
  subClassOf: "Subclass Of",
  domain: "Domain",
  range: "Range",
  broader: "Broader",
  predicate: "Predicate"
};

await main();

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--clean")) {
    fs.rmSync(SITE_DIR, { recursive: true, force: true });
    console.log("Removed generated site/");
    return;
  }

  const config = loadConfig(CONFIG_PATH);
  validateConfig(config);

  const assets = buildAssetManifest(config);
  if (args.has("--check")) {
    const ontologyInfo = await parseOntology(config, assets);
    console.log(
      `Configuration valid: parsed ${ontologyInfo.stats.declaredTerms} declared terms and ${ontologyInfo.edges.length} relationships.`
    );
    return;
  }

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  ensureDir(ASSETS_DIR);
  ensureDir(TERMS_DIR);

  const ontologyInfo = await parseOntology(config, assets);
  const relationshipSummary = buildRelationshipSummary(ontologyInfo);
  const hierarchyTtl = buildHierarchyTtl(ontologyInfo);

  copyAssets(assets);
  copyBrandingAssets();
  copyGraphVendorAssets();
  writeText(path.join(ASSETS_DIR, "ontology_graph_data.json"), JSON.stringify(ontologyInfo, null, 2));
  writeText(
    path.join(ASSETS_DIR, "ontology_relationships_overview.json"),
    JSON.stringify(relationshipSummary, null, 2)
  );
  if (config.features.hierarchyAsset) {
    writeText(path.join(ASSETS_DIR, "ontology_hierarchy.ttl"), hierarchyTtl);
  }

  const context = {
    config,
    assets,
    ontologyInfo,
    relationshipSummary
  };

  writeText(path.join(SITE_DIR, "index.html"), buildIndexPage(context));
  if (config.features.referencePage) {
    writeText(path.join(SITE_DIR, "ontology-reference.html"), buildReferencePage(context));
  }
  if (config.features.graphPage) {
    writeText(path.join(SITE_DIR, "ontology-graph.html"), buildGraphPage(context));
  }
  if (config.features.specPage) {
    writeSpecPage(config);
  }
  if (config.features.usageGuidePage) {
    writeText(path.join(SITE_DIR, "usage-guide.html"), buildGuidePage(context));
  }
  if (config.features.termPages) {
    writeTermPages(context);
  }

  writeText(path.join(SITE_DIR, ".nojekyll"), "");
  console.log("Generated site/ from ocg.config.json");
}

function loadConfig(configPath) {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    ...raw,
    features: { ...DEFAULT_FEATURES, ...(raw.features || {}) },
    theme: {
      fonts: { ...DEFAULT_THEME.fonts, ...(raw.theme?.fonts || {}) },
      colors: { ...DEFAULT_THEME.colors, ...(raw.theme?.colors || {}) }
    },
    site: {
      ...DEFAULT_SITE,
      ...(raw.site || {}),
      hero: { ...DEFAULT_SITE.hero, ...(raw.site?.hero || {}) },
      resourcePanel: { ...DEFAULT_SITE.resourcePanel, ...(raw.site?.resourcePanel || {}) },
      toc: { ...DEFAULT_SITE.toc, ...(raw.site?.toc || {}) },
      home: {
        ...DEFAULT_SITE.home,
        ...(raw.site?.home || {}),
        actions: { ...DEFAULT_SITE.home.actions, ...(raw.site?.home?.actions || {}) },
        metadata: { ...DEFAULT_SITE.home.metadata, ...(raw.site?.home?.metadata || {}) },
        snapshot: { ...DEFAULT_SITE.home.snapshot, ...(raw.site?.home?.snapshot || {}) },
        overview: { ...DEFAULT_SITE.home.overview, ...(raw.site?.home?.overview || {}) },
        featuredTerms: { ...DEFAULT_SITE.home.featuredTerms, ...(raw.site?.home?.featuredTerms || {}) },
        examples: { ...DEFAULT_SITE.home.examples, ...(raw.site?.home?.examples || {}) },
        viewer: { ...DEFAULT_SITE.home.viewer, ...(raw.site?.home?.viewer || {}) },
        artifacts: { ...DEFAULT_SITE.home.artifacts, ...(raw.site?.home?.artifacts || {}) }
      },
      footer: { ...DEFAULT_SITE.footer, ...(raw.site?.footer || {}) },
      generator: { ...DEFAULT_SITE.generator, ...(raw.site?.generator || {}) }
    },
    hierarchy: {
      ...DEFAULT_HIERARCHY,
      ...(raw.hierarchy || {}),
      termTypes: raw.hierarchy?.termTypes || DEFAULT_HIERARCHY.termTypes,
      relations: raw.hierarchy?.relations || DEFAULT_HIERARCHY.relations,
      rootTerms: raw.hierarchy?.rootTerms || DEFAULT_HIERARCHY.rootTerms,
      propertyRelations: raw.hierarchy?.propertyRelations || DEFAULT_HIERARCHY.propertyRelations
    },
    graph: {
      ...DEFAULT_GRAPH,
      ...(raw.graph || {}),
      custom: {
        ...DEFAULT_GRAPH.custom,
        ...(raw.graph?.custom || {}),
        modes: { ...DEFAULT_GRAPH.custom.modes, ...(raw.graph?.custom?.modes || {}) },
        layout: { ...DEFAULT_GRAPH.custom.layout, ...(raw.graph?.custom?.layout || {}) },
        labels: { ...DEFAULT_GRAPH.custom.labels, ...(raw.graph?.custom?.labels || {}) }
      },
      webvowl: { ...DEFAULT_GRAPH.webvowl, ...(raw.graph?.webvowl || {}) },
      colors: { ...DEFAULT_GRAPH.colors, ...(raw.graph?.colors || {}) }
    },
    sources: {
      ...(raw.sources || {}),
      examples: raw.sources?.examples || [],
      artifacts: raw.sources?.artifacts || []
    },
    curation: {
      featuredTerms: raw.curation?.featuredTerms || [],
      autoFeaturedTerms: raw.curation?.autoFeaturedTerms !== false,
      featuredTermLimit: Number.isInteger(raw.curation?.featuredTermLimit)
        ? raw.curation.featuredTermLimit
        : 6,
      viewerTabs: raw.curation?.viewerTabs || []
    }
  };
}

function validateConfig(config) {
  const requiredProjectFields = [
    "title",
    "shortName",
    "slug",
    "description",
    "namespace",
    "canonicalUri"
  ];

  for (const field of requiredProjectFields) {
    if (!config.project?.[field]) {
      throw new Error(`ocg.config.json is missing project.${field}`);
    }
  }

  if (!config.sources?.ontology) {
    throw new Error("ocg.config.json is missing sources.ontology");
  }
  if (config.sources.ontologyFormat && !["auto", ...SUPPORTED_ONTOLOGY_FORMAT_NAMES].includes(config.sources.ontologyFormat)) {
    throw new Error(
      `sources.ontologyFormat must be one of auto, ${SUPPORTED_ONTOLOGY_FORMAT_NAMES.join(", ")}`
    );
  }
  if (config.features.specPage && !config.sources.spec) {
    throw new Error("features.specPage requires sources.spec");
  }

  validateHierarchyConfig(config);

  const requiredPaths = [config.sources.ontology];
  for (const value of [config.sources.shapes, config.sources.shex, config.sources.spec]) {
    if (value) {
      requiredPaths.push(value);
    }
  }
  for (const example of config.sources.examples || []) {
    if (!example.key || !example.label || !example.path) {
      throw new Error("Each sources.examples entry requires key, label, and path");
    }
    requiredPaths.push(example.path);
  }
  for (const artifact of config.sources.artifacts || []) {
    if (!artifact.key || !artifact.label || !artifact.path) {
      throw new Error("Each sources.artifacts entry requires key, label, and path");
    }
    requiredPaths.push(artifact.path);
  }
  if (!Number.isInteger(config.curation.featuredTermLimit) || config.curation.featuredTermLimit < 0) {
    throw new Error("curation.featuredTermLimit must be a non-negative integer");
  }
  requiredPaths.push(
    CONFIG_PATH,
    CONFIG_SCHEMA_TEMPLATE_PATH,
    PACKAGE_PATH,
    getProjectOrPackageResource(PROJECT_WORKFLOW_PATH, WORKFLOW_TEMPLATE_PATH),
    getProjectOrPackageResource(PROJECT_SOURCE_GUIDE_PATH, SOURCE_GUIDE_TEMPLATE_PATH),
    getProjectOrPackageResource(FAVICON_PNG_PROJECT_PATH, FAVICON_PNG_TEMPLATE_PATH),
    getProjectOrPackageResource(FAVICON_ICO_PROJECT_PATH, FAVICON_ICO_TEMPLATE_PATH)
  );
  requiredPaths.push(...GRAPH_VENDOR_ASSETS.map((asset) => asset.sourcePath));

  for (const filePath of requiredPaths) {
    const absolute = path.isAbsolute(filePath) ? filePath : resolveProjectPath(filePath);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Configured file does not exist: ${path.relative(PROJECT_ROOT, absolute)}`);
    }
  }

  if (!config.project.namespace.endsWith("#") && !config.project.namespace.endsWith("/")) {
    throw new Error("project.namespace should end with '#' or '/' so local terms can be derived");
  }

  if (!config.graph.custom.enabled && !config.graph.webvowl.enabled) {
    throw new Error("At least one graph representation must be enabled");
  }
  if (config.graph.custom.enabled) {
    const customModes = config.graph.custom.modes;
    if (!customModes.predicateNodes && !customModes.predicateEdges) {
      throw new Error("At least one custom graph mode must be enabled");
    }
    if (!["predicate-nodes", "predicate-edges"].includes(config.graph.custom.defaultMode)) {
      throw new Error("graph.custom.defaultMode must be 'predicate-nodes' or 'predicate-edges'");
    }
    const defaultCustomModeEnabled = config.graph.custom.defaultMode === "predicate-nodes"
      ? customModes.predicateNodes
      : customModes.predicateEdges;
    if (!defaultCustomModeEnabled) {
      throw new Error(`graph.custom.defaultMode '${config.graph.custom.defaultMode}' is disabled`);
    }
    const { layout, labels } = config.graph.custom;
    for (const [option, value, minimum, maximum] of [
      ["layout.iterations", layout.iterations, 50, 2000],
      ["layout.seed", layout.seed, 0, 2147483647],
      ["labels.gridCellSize", labels.gridCellSize, 20, 300],
      ["labels.forceAllUnder", labels.forceAllUnder, 0, 2000]
    ]) {
      if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`graph.custom.${option} must be an integer between ${minimum} and ${maximum}`);
      }
    }
    for (const [option, value, minimum, maximum] of [
      ["layout.scalingRatio", layout.scalingRatio, 0.25, 8],
      ["layout.gravity", layout.gravity, 0.01, 20],
      ["layout.labelSpacing", layout.labelSpacing, 0.5, 3],
      ["labels.density", labels.density, 0.1, 10],
      ["labels.renderedSizeThreshold", labels.renderedSizeThreshold, 0, 20]
    ]) {
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new Error(`graph.custom.${option} must be a number between ${minimum} and ${maximum}`);
      }
    }
    if (typeof layout.linLogMode !== "boolean" || typeof layout.preventOverlap !== "boolean") {
      throw new Error("graph.custom.layout.linLogMode and graph.custom.layout.preventOverlap must be booleans");
    }
  }
  if (!["custom", "webvowl"].includes(config.graph.defaultView)) {
    throw new Error("graph.defaultView must be 'custom' or 'webvowl'");
  }
  if (!config.graph[config.graph.defaultView].enabled) {
    throw new Error(`graph.defaultView '${config.graph.defaultView}' is disabled`);
  }
  if (config.graph.webvowl.enabled) {
    try {
      new URL(config.graph.webvowl.serviceUrl);
    } catch {
      throw new Error("graph.webvowl.serviceUrl must be a valid URL");
    }
    if (config.graph.webvowl.ontologyUrl) {
      try {
        const ontologyUrl = new URL(config.graph.webvowl.ontologyUrl);
        if (ontologyUrl.hash || config.graph.webvowl.ontologyUrl.includes("#") || config.graph.webvowl.ontologyUrl === config.project.namespace) {
          throw new Error("must not include a fragment");
        }
      } catch {
        throw new Error("graph.webvowl.ontologyUrl must be a public ontology document URL without a fragment; do not use project.namespace");
      }
    }
  }
}

function validateHierarchyConfig(config) {
  const hierarchy = config.hierarchy;
  const validTermTypes = new Set(TERM_TYPE_ORDER.filter((type) => type !== "external"));
  const validRelations = new Set(["subClassOf", "broader"]);
  const validPropertyRelations = new Set(["domain", "range"]);

  if (!hierarchy || typeof hierarchy !== "object" || Array.isArray(hierarchy)) {
    throw new Error("hierarchy must be an object");
  }
  for (const [key, values, allowed] of [
    ["termTypes", hierarchy.termTypes, validTermTypes],
    ["relations", hierarchy.relations, validRelations],
    ["propertyRelations", hierarchy.propertyRelations, validPropertyRelations]
  ]) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !allowed.has(value))) {
      throw new Error(`hierarchy.${key} contains an unsupported value`);
    }
  }
  if (!Array.isArray(hierarchy.rootTerms) || hierarchy.rootTerms.some((value) => typeof value !== "string")) {
    throw new Error("hierarchy.rootTerms must be an array of qnames or IRIs");
  }
  for (const [key, minimum] of [
    ["maxRoots", 1],
    ["maxDepth", 0],
    ["maxChildrenPerNode", 1],
    ["maxNodes", 1],
    ["maxPropertyRelations", 0]
  ]) {
    if (!Number.isInteger(hierarchy[key]) || hierarchy[key] < minimum) {
      throw new Error(`hierarchy.${key} must be an integer >= ${minimum}`);
    }
  }
  if (typeof hierarchy.includeLeafTerms !== "boolean" || typeof hierarchy.includeExternal !== "boolean" || typeof hierarchy.includePropertyRelations !== "boolean") {
    throw new Error("hierarchy.includeLeafTerms, includeExternal, and includePropertyRelations must be booleans");
  }
  if (!new Set(["label", "qname", "label-and-qname"]).has(hierarchy.labelMode)) {
    throw new Error("hierarchy.labelMode must be 'label', 'qname', or 'label-and-qname'");
  }
}

function buildAssetManifest(config) {
  const assets = [];
  const homeArtifacts = config.site.home.artifacts;
  const addAsset = ({ key, label, filePath, description, kind, destinationName }) => {
    const absolute = path.isAbsolute(filePath) ? filePath : resolveProjectPath(filePath);
    const relativeSource = path.relative(PROJECT_ROOT, absolute).replaceAll("\\", "/");
    const destName = destinationName || path.basename(absolute);
    assets.push({
      key,
      label,
      description: description || "",
      kind,
      sourcePath: absolute,
      relativeSource,
      destName,
      publicPath: `assets/${destName}`
    });
  };

  addAsset({
    key: "ontology",
    label: homeArtifacts.ontologyLabel,
    filePath: config.sources.ontology,
    description: homeArtifacts.ontologyDescription,
    kind: "ontology"
  });

  if (config.sources.shapes) {
    addAsset({
      key: "shapes",
      label: homeArtifacts.shapesLabel,
      filePath: config.sources.shapes,
      description: homeArtifacts.shapesDescription,
      kind: "shapes"
    });
  }

  if (config.sources.shex) {
    addAsset({
      key: "shex",
      label: homeArtifacts.shexLabel,
      filePath: config.sources.shex,
      description: homeArtifacts.shexDescription,
      kind: "shex"
    });
  }

  for (const example of config.sources.examples || []) {
    addAsset({
      key: `example:${example.key}`,
      label: example.label,
      filePath: example.path,
      description: example.description || "",
      kind: "example"
    });
  }

  if (config.sources.spec) {
    addAsset({
      key: "spec",
      label: homeArtifacts.specificationLabel,
      filePath: config.sources.spec,
      description: homeArtifacts.specificationDescription,
      kind: "spec",
      destinationName: "spec-source.html"
    });
  }

  for (const artifact of config.sources.artifacts || []) {
    addAsset({
      key: `artifact:${artifact.key}`,
      label: artifact.label,
      filePath: artifact.path,
      description: artifact.description || homeArtifacts.additionalArtifactDescription,
      kind: "artifact",
      destinationName: artifact.destinationName ? sanitizeFileName(artifact.destinationName) : undefined
    });
  }

  addAsset({
    key: "config",
    label: "Config JSON",
    filePath: CONFIG_PATH,
    description: "The primary customization document that drives the generated site.",
    kind: "config",
    destinationName: "ocg.config.json"
  });
  addAsset({
    key: "config-schema",
    label: "Config Schema",
    filePath: getProjectOrPackageResource(PROJECT_SCHEMA_PATH, CONFIG_SCHEMA_TEMPLATE_PATH),
    description: "JSON Schema reference for ocg.config.json.",
    kind: "config",
    destinationName: "ocg.config.schema.json"
  });
  addAsset({
    key: "workflow",
    label: "GitHub Pages Workflow",
    filePath: getProjectOrPackageResource(PROJECT_WORKFLOW_PATH, WORKFLOW_TEMPLATE_PATH),
    description: "GitHub Actions deployment workflow shipped with the template.",
    kind: "workflow",
    destinationName: "publish-pages.yml"
  });
  addAsset({
    key: "source-guide",
    label: "Source Replacement Guide",
    filePath: getProjectOrPackageResource(PROJECT_SOURCE_GUIDE_PATH, SOURCE_GUIDE_TEMPLATE_PATH),
    description: "Quick instructions for integrating OCG into an existing ontology repository.",
    kind: "guide",
    destinationName: "README-source-guide.txt"
  });

  return assets;
}

function copyAssets(assets) {
  for (const asset of assets) {
    fs.copyFileSync(asset.sourcePath, path.join(ASSETS_DIR, asset.destName));
  }
}

function copyBrandingAssets() {
  fs.copyFileSync(
    getProjectOrPackageResource(FAVICON_PNG_PROJECT_PATH, FAVICON_PNG_TEMPLATE_PATH),
    path.join(SITE_DIR, "favicon.png")
  );
  fs.copyFileSync(FAVICON_PNG_TEMPLATE_PATH, path.join(SITE_DIR, "ocg-favicon.png"));
  fs.copyFileSync(
    getProjectOrPackageResource(FAVICON_ICO_PROJECT_PATH, FAVICON_ICO_TEMPLATE_PATH),
    path.join(SITE_DIR, "favicon.ico")
  );
}

function copyGraphVendorAssets() {
  ensureDir(VENDOR_ASSETS_DIR);
  for (const asset of GRAPH_VENDOR_ASSETS) {
    fs.copyFileSync(asset.sourcePath, path.join(VENDOR_ASSETS_DIR, asset.destinationName));
  }
}

function writeSpecPage(config) {
  const sourcePath = resolveProjectPath(config.sources.spec);
  const destination = path.join(SITE_DIR, "spec", "index.html");
  ensureDir(path.dirname(destination));
  const source = fs.readFileSync(sourcePath, "utf8");
  const nav = buildNav(config, "spec", "../");
  const specHowTo = config.features.usageGuidePage
    ? `<a class="nav-link nav-link--how-to" href="../usage-guide.html#specification">How To</a>`
    : "";
  const navigation = `
    <div class="ocg-spec-nav-shell">
      <header class="ocg-spec-header">
        <a class="ocg-spec-brand" href="../index.html">
          <span class="ocg-spec-brand-mark">${escapeHtml(config.project.shortName)}</span>
          <span class="ocg-spec-brand-copy">
            <strong>${escapeHtml(config.project.title)}</strong>
            <span>${escapeHtml(config.project.namespace)}</span>
          </span>
        </a>
        <nav class="ocg-spec-nav" aria-label="Companion site navigation">${nav}${specHowTo}</nav>
      </header>
    </div>
  `;
  const styledSource = source.replace(
    /<\/head>/i,
    `<link rel="icon" href="../favicon.ico" sizes="any" />\n  <link rel="icon" type="image/png" sizes="512x512" href="../favicon.png" />\n  ${specPageCss(config)}\n  </head>`
  );
  const generated = styledSource.replace(/<body([^>]*)>/i, (match, attributes) => {
    const classAttribute = attributes.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
    const updatedAttributes = classAttribute
      ? attributes.replace(
          classAttribute[0],
          `class=${classAttribute[1]}${classAttribute[2]} ocg-spec-page${classAttribute[1]}`
        )
      : `${attributes} class="ocg-spec-page"`;
    return `<body${updatedAttributes}>${navigation}`;
  });
  if (generated === styledSource) {
    throw new Error("Configured sources.spec must contain a body element for navigation injection");
  }
  fs.writeFileSync(destination, generated.replace(/<\/body>/i, `${buildSpecFooter(config)}\n</body>`));
}

function buildSpecFooter(config) {
  return `
    <footer class="ocg-spec-footer">
      <div class="site-footer-generator">
        ${generatorAttribution(config, "../")}
      </div>
    </footer>
  `;
}

function specPageCss(config) {
  const colors = config.theme.colors;
  const fonts = config.theme.fonts;
  return `
    <style>
      body.ocg-spec-page {
        padding-top: 106px !important;
      }
      body.ocg-spec-page #toc {
        top: 106px !important;
      }
      .ocg-spec-nav-shell {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
        display: block !important;
        width: 100vw !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 18px max(16px, 4vw) 0;
        box-sizing: border-box;
        font-family: "${fonts.body}", sans-serif;
      }
      .ocg-spec-header {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: min(1120px, 100%);
        margin: 0 auto;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid ${colors.border};
        border-radius: 16px;
        box-shadow: 0 18px 38px rgba(16, 37, 56, 0.11);
        backdrop-filter: blur(12px);
      }
      .ocg-spec-brand {
        display: flex;
        align-items: center;
        gap: 11px;
        min-width: 0;
        color: ${colors.text};
        text-decoration: none;
      }
      .ocg-spec-brand:hover {
        text-decoration: none;
      }
      .ocg-spec-brand-mark {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        border-radius: 12px;
        background: linear-gradient(140deg, #248992 0%, ${colors.accent} 100%);
        color: #ffffff;
        font-family: "${fonts.heading}", sans-serif;
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .ocg-spec-brand-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .ocg-spec-brand-copy strong {
        color: ${colors.text};
        font-family: "${fonts.heading}", sans-serif;
        font-size: 0.92rem;
      }
      .ocg-spec-brand-copy span {
        color: ${colors.mutedText};
        font-size: 0.76rem;
        overflow-wrap: anywhere;
      }
      .ocg-spec-nav {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
      }
      .ocg-spec-nav .nav-link {
        padding: 7px 10px;
        border-radius: 999px;
        color: #294456;
        font-size: 0.88rem;
        font-weight: 600;
        text-decoration: none;
      }
      .ocg-spec-nav .nav-link:hover,
      .ocg-spec-nav .nav-link.is-active {
        color: ${colors.accentStrong};
        background: rgba(31, 111, 120, 0.12);
        text-decoration: none;
      }
      .ocg-spec-nav .nav-link--guide,
      .ocg-spec-nav .nav-link--how-to {
        color: #687681;
        background: #f0f2f3;
        border: 1px solid #d7dde1;
      }
      .ocg-spec-nav .nav-link--guide:hover,
      .ocg-spec-nav .nav-link--how-to:hover,
      .ocg-spec-nav .nav-link--guide.is-active {
        color: #45525c;
        background: #e4e8ea;
        border-color: #c4ccd1;
      }
      .ocg-spec-footer {
        width: min(1120px, 92vw);
        margin: 36px auto 60px;
        color: ${colors.mutedText};
        font-family: "${fonts.body}", sans-serif;
        font-size: 0.92rem;
      }
      .ocg-spec-footer .site-footer-generator {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 14px;
        text-align: center;
      }
      .ocg-spec-footer .site-footer-separator {
        color: ${colors.border};
        font-weight: 500;
      }
      .ocg-spec-footer a {
        color: ${colors.accent};
        font-weight: 600;
      }
      .ocg-spec-footer .ocg-footer-repository {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ocg-spec-footer .ocg-footer-icon {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        object-fit: contain;
      }
      @media (max-width: 860px) {
        body.ocg-spec-page {
          padding-top: 160px !important;
        }
        body.ocg-spec-page #toc {
          top: 160px !important;
        }
        .ocg-spec-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .ocg-spec-nav {
          justify-content: flex-start;
        }
      }
    </style>`;
}

function resolveOntologyFormat(filePath, configuredFormat) {
  if (configuredFormat !== "auto") {
    return configuredFormat;
  }

  const extension = path.extname(filePath).toLowerCase();
  for (const [format, details] of Object.entries(SUPPORTED_ONTOLOGY_FORMATS)) {
    if (details.extensions.includes(extension)) {
      return format;
    }
  }

  throw new Error(
    `Unsupported ontology format for '${filePath}'. Supported formats: ${SUPPORTED_ONTOLOGY_FORMAT_NAMES.join(", ")}. Set sources.ontologyFormat when the file extension is ambiguous.`
  );
}

async function parseOntologySource(filePath, format) {
  const parserConfig = SUPPORTED_ONTOLOGY_FORMATS[format];
  const quads = [];
  const prefixes = [];
  const parserStream = rdfParser.parse(fs.createReadStream(filePath), {
    path: filePath,
    contentType: parserConfig.contentType
  });

  try {
    await new Promise((resolve, reject) => {
      parserStream.on("prefix", (prefix, iri) => {
        const base = typeof iri === "string" ? iri : iri?.value;
        if (base && !prefixes.some((entry) => entry.prefix === prefix && entry.base === base)) {
          prefixes.push({ prefix, base });
        }
      });
      parserStream.on("data", (quad) => quads.push(quad));
      parserStream.on("error", reject);
      parserStream.on("end", resolve);
    });
  } catch (error) {
    throw new Error(`Could not parse '${filePath}' as ${format}: ${error.message}`);
  }

  return { quads, prefixes };
}

async function parseOntology(config, assets) {
  const ontologyAsset = assets.find((asset) => asset.key === "ontology");
  const format = resolveOntologyFormat(config.sources.ontology, config.sources.ontologyFormat || "auto");
  const parsed = await parseOntologySource(ontologyAsset.sourcePath, format);
  const prefixes = [...parsed.prefixes];
  const triples = parsed.quads.map((quad) => ({
    subjectUri: quad.subject.termType === "NamedNode" ? quad.subject.value : null,
    predicateUri: quad.predicate.termType === "NamedNode" ? quad.predicate.value : null,
    objectUri: quad.object.termType === "NamedNode" ? quad.object.value : null,
    objectLiteral: quad.object.termType === "Literal" ? quad.object.value : null
  }));
  const namespace = config.project.namespace;
  if (!prefixes.some((entry) => entry.base === namespace)) {
    prefixes.unshift({ prefix: "vocab", base: namespace });
  }

  const termMap = new Map();
  const edgeCandidates = [];

  for (const triple of triples) {
    if (triple.subjectUri && triple.subjectUri.startsWith(namespace)) {
      ensureTerm(termMap, triple.subjectUri, prefixes, namespace, false);
    }
  }

  for (const triple of triples) {
    if (!triple.subjectUri || !triple.subjectUri.startsWith(namespace)) {
      continue;
    }

    const term = ensureTerm(termMap, triple.subjectUri, prefixes, namespace, false);

    if (triple.predicateUri === RDF_TYPE && triple.objectUri) {
      term.types.add(triple.objectUri);
      term.termType = classifyTerm(term.types);
    } else if (
      (triple.predicateUri === RDFS_LABEL || triple.predicateUri === SKOS_PREF_LABEL) &&
      triple.objectLiteral
    ) {
      term.label = triple.objectLiteral;
    } else if (
      (triple.predicateUri === RDFS_COMMENT || triple.predicateUri === SKOS_DEFINITION) &&
      triple.objectLiteral
    ) {
      term.comment = triple.objectLiteral;
    } else if (
      [RDFS_SUBCLASS_OF, RDFS_DOMAIN, RDFS_RANGE, SKOS_BROADER].includes(triple.predicateUri) &&
      triple.objectUri
    ) {
      edgeCandidates.push({
        source: triple.subjectUri,
        target: triple.objectUri,
        relation: relationFromPredicate(triple.predicateUri)
      });
    }
  }

  for (const term of termMap.values()) {
    term.termType = classifyTerm(term.types);
  }

  const edges = [];
  for (const edge of edgeCandidates) {
    const source = termMap.get(edge.source);
    if (!source) {
      continue;
    }
    const target = edge.target.startsWith(namespace)
      ? ensureTerm(termMap, edge.target, prefixes, namespace, false)
      : ensureTerm(termMap, edge.target, prefixes, namespace, true);

    edges.push({
      source: source.id,
      target: target.id,
      sourceQname: source.qname,
      targetQname: target.qname,
      relation: edge.relation
    });
  }

  const nodes = Array.from(termMap.values()).sort(sortTerms);
  const layout = buildLayout(nodes, edges, config.graph.custom.layout);
  for (const node of nodes) {
    const point = layout.get(node.id);
    node.x = point.x;
    node.y = point.y;
    node.types = Array.from(node.types).map((uri) => uriToQnameOrIri(uri, prefixes));
  }

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  for (const node of nodes) {
    node.degree = degree.get(node.id) || 0;
  }

  const graphEdges = edges.map((edge, index) => ({
    ...edge,
    id: `rel-${String(index + 1).padStart(3, "0")}`,
    predicateQname: predicateQnameForRelation(edge.relation),
    label: edge.relation
  }));
  const predicateEdgeMode = buildPredicateEdgeMode(nodes, graphEdges, config.graph.custom.layout);

  return {
    project: {
      title: config.project.title,
      shortName: config.project.shortName,
      slug: config.project.slug,
      description: config.project.description,
      namespace: config.project.namespace,
      canonicalUri: config.project.canonicalUri,
      version: config.project.version || "",
      maintainer: config.project.maintainer || ""
    },
    generatedAt: new Date().toISOString(),
    source: ontologyAsset.relativeSource,
    sourceFormat: format,
    namespace,
    nodes,
    edges: graphEdges,
    modes: {
      "predicate-nodes": {
        nodes,
        edges: graphEdges
      },
      "predicate-edges": predicateEdgeMode
    },
    stats: {
      declaredTerms: nodes.filter((node) => !node.isExternal).length,
      externalReferences: nodes.filter((node) => node.isExternal).length
    }
  };
}

function ensureTerm(termMap, uri, orderedPrefixes, namespace, isExternal) {
  if (!termMap.has(uri)) {
    const qname = uriToQnameOrIri(uri, orderedPrefixes);
    termMap.set(uri, {
      id: uri,
      uri,
      qname,
      localName: toLocalName(uri, namespace),
      label: qname,
      comment: "",
      termType: isExternal ? "external" : "declaredTerm",
      types: new Set(),
      isExternal
    });
  }

  return termMap.get(uri);
}

function classifyTerm(types) {
  if (types.has(OWL_CLASS)) {
    return "class";
  }
  if (types.has(OWL_OBJECT_PROPERTY)) {
    return "objectProperty";
  }
  if (types.has(OWL_DATATYPE_PROPERTY)) {
    return "datatypeProperty";
  }
  if (types.has(OWL_ANNOTATION_PROPERTY)) {
    return "annotationProperty";
  }
  if (types.has(SKOS_CONCEPT)) {
    return "concept";
  }
  return "declaredTerm";
}

function relationFromPredicate(predicateUri) {
  if (predicateUri === RDFS_SUBCLASS_OF) {
    return "subClassOf";
  }
  if (predicateUri === RDFS_DOMAIN) {
    return "domain";
  }
  if (predicateUri === RDFS_RANGE) {
    return "range";
  }
  if (predicateUri === SKOS_BROADER) {
    return "broader";
  }
  return "relatedTo";
}

function predicateQnameForRelation(relation) {
  return {
    subClassOf: "rdfs:subClassOf",
    domain: "rdfs:domain",
    range: "rdfs:range",
    broader: "skos:broader"
  }[relation] || relation;
}

function buildPredicateEdgeMode(nodes, edges, layoutOptions) {
  const predicateTypes = new Set(["objectProperty", "datatypeProperty", "annotationProperty"]);
  const predicateNodes = nodes.filter((node) => predicateTypes.has(node.termType));
  const predicateNodeIds = new Set(predicateNodes.map((node) => node.id));
  const retainedNodes = nodes
    .filter((node) => !predicateNodeIds.has(node.id))
    .map((node) => ({ ...node }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const domainsByPredicate = new Map();
  const rangesByPredicate = new Map();
  const structuralEdges = [];

  for (const edge of edges) {
    const sourceIsPredicate = predicateNodeIds.has(edge.source);
    const targetIsPredicate = predicateNodeIds.has(edge.target);
    if (sourceIsPredicate && edge.relation === "domain") {
      if (!domainsByPredicate.has(edge.source)) {
        domainsByPredicate.set(edge.source, []);
      }
      domainsByPredicate.get(edge.source).push(edge.target);
      continue;
    }
    if (sourceIsPredicate && edge.relation === "range") {
      if (!rangesByPredicate.has(edge.source)) {
        rangesByPredicate.set(edge.source, []);
      }
      rangesByPredicate.get(edge.source).push(edge.target);
      continue;
    }
    if (!sourceIsPredicate && !targetIsPredicate) {
      structuralEdges.push({ ...edge });
    }
  }

  const predicateEdges = [];
  for (const predicate of predicateNodes) {
    const domains = domainsByPredicate.get(predicate.id) || [];
    const ranges = rangesByPredicate.get(predicate.id) || [];
    for (const sourceId of domains) {
      for (const targetId of ranges) {
        const source = nodeById.get(sourceId);
        const target = nodeById.get(targetId);
        if (!source || !target || predicateNodeIds.has(source.id) || predicateNodeIds.has(target.id)) {
          continue;
        }
        predicateEdges.push({
          source: source.id,
          target: target.id,
          sourceQname: source.qname,
          targetQname: target.qname,
          relation: "predicate",
          predicateQname: predicate.qname,
          label: predicate.qname,
          predicateUri: predicate.uri
        });
      }
    }
  }

  const modeEdges = [...structuralEdges, ...predicateEdges].map((edge, index) => ({
    ...edge,
    id: `rel-${String(index + 1).padStart(3, "0")}`
  }));
  const layout = buildLayout(retainedNodes, modeEdges, layoutOptions);
  for (const node of retainedNodes) {
    const point = layout.get(node.id);
    node.x = point.x;
    node.y = point.y;
  }

  const degree = new Map(retainedNodes.map((node) => [node.id, 0]));
  for (const edge of modeEdges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  for (const node of retainedNodes) {
    node.degree = degree.get(node.id) || 0;
  }

  return {
    nodes: retainedNodes,
    edges: modeEdges,
    stats: {
      declaredTerms: retainedNodes.filter((node) => !node.isExternal).length,
      externalReferences: retainedNodes.filter((node) => node.isExternal).length
    }
  };
}

function estimateGraphLabelWidth(node) {
  const label = String(node.qname || node.label || node.localName || "");
  let width = 18;
  for (const character of label) {
    width += /[MW@#%&]/.test(character)
      ? 8.6
      : /[ilI1|.:,'`]/.test(character)
        ? 4.2
        : /[A-Z0-9]/.test(character)
          ? 7.4
          : 6.6;
  }
  return clamp(width, 72, 420);
}

function layoutHash(value, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash / 4294967296;
}

function layoutRelationWeight(relation) {
  return {
    subClassOf: 2.4,
    broader: 2.2,
    domain: 1.45,
    range: 1.45,
    predicate: 1.7
  }[relation] || 1;
}

function findLayoutComponents(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacent = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    adjacent.get(edge.source).add(edge.target);
    adjacent.get(edge.target).add(edge.source);
  }
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set();
  const components = [];
  for (const node of [...nodes].sort((left, right) => collator.compare(left.qname, right.qname))) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    const component = [];
    visited.add(node.id);
    while (queue.length) {
      const nodeId = queue.shift();
      component.push(nodesById.get(nodeId));
      for (const neighbor of [...adjacent.get(nodeId)].sort((left, right) => collator.compare(left, right))) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function orientLayoutComponent(layoutGraph, componentEdges) {
  if (layoutGraph.order < 2) return;
  let directionX = 0;
  let directionY = 0;
  for (const edge of componentEdges) {
    const source = layoutGraph.getNodeAttributes(edge.source);
    const target = layoutGraph.getNodeAttributes(edge.target);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) continue;
    const weight = layoutRelationWeight(edge.relation);
    directionX += (dx / distance) * weight;
    directionY += (dy / distance) * weight;
  }
  if (Math.hypot(directionX, directionY) < 0.25) return;
  const rotation = -Math.PI / 2 - Math.atan2(directionY, directionX);
  let centerX = 0;
  let centerY = 0;
  layoutGraph.forEachNode((nodeId, attributes) => {
    centerX += attributes.x;
    centerY += attributes.y;
  });
  centerX /= layoutGraph.order;
  centerY /= layoutGraph.order;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  layoutGraph.forEachNode((nodeId, attributes) => {
    const x = attributes.x - centerX;
    const y = attributes.y - centerY;
    layoutGraph.mergeNodeAttributes(nodeId, {
      x: x * cosine - y * sine + centerX,
      y: x * sine + y * cosine + centerY
    });
  });
}

function layoutComponent(componentNodes, componentEdges, degree, options) {
  const graph = new Graph({ type: "undirected", multi: true, allowSelfLoops: false });
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const orderedNodes = [...componentNodes].sort(
    (left, right) => (degree.get(right.id) || 0) - (degree.get(left.id) || 0) || collator.compare(left.qname, right.qname)
  );
  orderedNodes.forEach((node, index) => {
    const labelWidth = estimateGraphLabelWidth(node);
    const baseSize = node.isExternal ? 6 : Math.min(14, 7 + Math.sqrt((degree.get(node.id) || 0) + 1));
    const collisionSize = Math.max(baseSize + 10, labelWidth * 0.56 * options.labelSpacing);
    const angle = index * goldenAngle + layoutHash(node.id, options.seed) * 0.28;
    const radius = index === 0 ? 0 : 72 * Math.sqrt(index);
    graph.addNode(node.id, {
      x: Math.cos(angle) * radius + (layoutHash(`${node.id}:x`, options.seed) - 0.5) * 12,
      y: Math.sin(angle) * radius + (layoutHash(`${node.id}:y`, options.seed) - 0.5) * 12,
      size: baseSize,
      collisionSize,
      labelWidth
    });
  });
  componentEdges.forEach((edge, index) => {
    if (edge.source === edge.target || !graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
    graph.addUndirectedEdgeWithKey(`layout-edge-${index}`, edge.source, edge.target, {
      weight: layoutRelationWeight(edge.relation)
    });
  });

  if (graph.order === 2) {
    const [left, right] = graph.nodes();
    const distance = graph.getNodeAttribute(left, "collisionSize") + graph.getNodeAttribute(right, "collisionSize") + 70;
    graph.mergeNodeAttributes(left, { x: -distance / 2, y: 0 });
    graph.mergeNodeAttributes(right, { x: distance / 2, y: 0 });
  } else if (graph.order > 2) {
    const inferred = forceAtlas2.inferSettings(graph);
    const iterationScale = clamp(0.7 + Math.log2(graph.order + 1) / 5, 0.85, 1.7);
    forceAtlas2.assign(graph, {
      iterations: Math.round(options.iterations * iterationScale),
      getEdgeWeight: "weight",
      settings: {
        ...inferred,
        adjustSizes: true,
        barnesHutOptimize: graph.order >= 100,
        barnesHutTheta: 0.5,
        edgeWeightInfluence: 1,
        gravity: options.gravity,
        linLogMode: options.linLogMode,
        scalingRatio: inferred.scalingRatio * options.scalingRatio,
        slowDown: graph.order >= 180 ? 3 : 1.5,
        strongGravityMode: false
      }
    });
  }

  if (options.preventOverlap && graph.order > 1) {
    noverlap.assign(graph, {
      maxIterations: 600,
      inputReducer: (nodeId, attributes) => ({
        x: attributes.x,
        y: attributes.y,
        size: attributes.collisionSize
      }),
      settings: {
        gridSize: graph.order < 30 ? 1 : 20,
        margin: 8 * options.labelSpacing,
        expansion: 1.12,
        ratio: 1,
        speed: 3
      }
    });
  }
  orientLayoutComponent(graph, componentEdges);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  graph.forEachNode((nodeId, attributes) => {
    const verticalRadius = Math.max(attributes.size + 8, 18 * options.labelSpacing);
    minX = Math.min(minX, attributes.x - attributes.size - 12);
    maxX = Math.max(maxX, attributes.x + attributes.size + attributes.labelWidth + 24);
    minY = Math.min(minY, attributes.y - verticalRadius - 12);
    maxY = Math.max(maxY, attributes.y + verticalRadius + 12);
  });
  const positions = new Map();
  graph.forEachNode((nodeId, attributes) => {
    positions.set(nodeId, { x: attributes.x - minX, y: attributes.y - minY });
  });
  return {
    nodes: componentNodes,
    positions,
    width: Math.max(120, maxX - minX),
    height: Math.max(80, maxY - minY)
  };
}

function packLayoutComponents(components) {
  const componentGap = 90;
  const isolateGap = 46;
  const padding = 70;
  const connected = components.filter((component) => component.nodes.length > 1).sort(
    (left, right) => right.nodes.length - left.nodes.length || right.width * right.height - left.width * left.height
  );
  const isolated = components.filter((component) => component.nodes.length === 1).sort((left, right) =>
    collator.compare(left.nodes[0].qname, right.nodes[0].qname)
  );
  const totalArea = connected.reduce(
    (sum, component) => sum + (component.width + componentGap) * (component.height + componentGap),
    0
  );
  const widestComponent = connected.reduce((width, component) => Math.max(width, component.width), 0);
  const isolatedWidth = isolated.reduce((width, component) => width + component.width, 0) +
    Math.max(0, isolated.length - 1) * isolateGap;
  const targetWidth = Math.max(
    720,
    widestComponent,
    Math.sqrt(totalArea) * 1.35,
    connected.length ? Math.min(isolatedWidth, Math.max(720, widestComponent)) : Math.sqrt(Math.max(isolatedWidth, 1) * 720)
  );
  const positions = new Map();
  const placeComponent = (component, x, y) => {
    for (const node of component.nodes) {
      const point = component.positions.get(node.id);
      positions.set(node.id, {
        x: Number((point.x + x).toFixed(3)),
        y: Number((point.y + y).toFixed(3))
      });
    }
  };
  let cursorX = padding;
  let cursorY = padding;
  let rowHeight = 0;
  let packedWidth = targetWidth;
  for (const component of connected) {
    if (cursorX > padding && cursorX + component.width > targetWidth) {
      cursorX = padding;
      cursorY += rowHeight + componentGap;
      rowHeight = 0;
    }
    placeComponent(component, cursorX, cursorY);
    cursorX += component.width + componentGap;
    rowHeight = Math.max(rowHeight, component.height);
    packedWidth = Math.max(packedWidth, cursorX - componentGap);
  }

  if (connected.length) {
    cursorY += rowHeight + componentGap;
  }
  if (isolated.length) {
    const availableWidth = Math.max(720, packedWidth - padding);
    const rows = [];
    let row = [];
    let rowWidth = 0;
    for (const component of isolated) {
      const nextWidth = rowWidth + (row.length ? isolateGap : 0) + component.width;
      if (row.length && nextWidth > availableWidth) {
        rows.push({ components: row, width: rowWidth });
        row = [];
        rowWidth = 0;
      }
      rowWidth += (row.length ? isolateGap : 0) + component.width;
      row.push(component);
    }
    if (row.length) rows.push({ components: row, width: rowWidth });

    for (const isolatedRow of rows) {
      let isolateX = padding + Math.max(0, (availableWidth - isolatedRow.width) / 2);
      let isolateHeight = 0;
      for (const component of isolatedRow.components) {
        placeComponent(component, isolateX, cursorY);
        isolateX += component.width + isolateGap;
        isolateHeight = Math.max(isolateHeight, component.height);
      }
      cursorY += isolateHeight + isolateGap;
    }
  }
  return positions;
}

function buildLayout(nodes, edges, options = DEFAULT_GRAPH.custom.layout) {
  if (!nodes.length) return new Map();
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const components = findLayoutComponents(nodes, edges).map((componentNodes) => {
    const componentNodeIds = new Set(componentNodes.map((node) => node.id));
    const componentEdges = edges.filter(
      (edge) => componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target)
    );
    return layoutComponent(componentNodes, componentEdges, degree, options);
  });
  return packLayoutComponents(components);
}

function buildRelationshipSummary(ontologyInfo) {
  const relationCounts = {};
  for (const edge of ontologyInfo.edges) {
    relationCounts[edge.relation] = (relationCounts[edge.relation] || 0) + 1;
  }
  return {
    generatedAt: ontologyInfo.generatedAt,
    termCounts: TERM_TYPE_ORDER.map((type) => ({
      type,
      label: TERM_TYPE_INFO[type].label,
      count: ontologyInfo.nodes.filter((node) => node.termType === type).length
    })),
    relationCounts
  };
}

function buildHierarchyTtl(ontologyInfo) {
  const prefixBlock = [
    `@prefix ontology: <${ontologyInfo.namespace}> .`,
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
    ""
  ];

  const statements = [];
  for (const edge of ontologyInfo.edges) {
    if (!["subClassOf", "broader", "domain", "range"].includes(edge.relation)) {
      continue;
    }
    const predicate =
      edge.relation === "subClassOf"
        ? "rdfs:subClassOf"
        : edge.relation === "broader"
          ? "skos:broader"
          : edge.relation === "domain"
            ? "rdfs:domain"
            : "rdfs:range";
    statements.push(`${edge.sourceQname} ${predicate} ${edge.targetQname} .`);
  }

  return [...prefixBlock, ...statements.sort((left, right) => collator.compare(left, right))].join("\n");
}

function buildReferenceHierarchy(context) {
  const { config, ontologyInfo } = context;
  if (!config.features.hierarchyOverview) {
    return "";
  }

  const settings = config.hierarchy;
  const includedTypes = new Set(settings.termTypes);
  const eligibleNodes = ontologyInfo.nodes.filter(
    (node) => (includedTypes.has(node.termType) || (settings.includeExternal && node.isExternal)) && (settings.includeExternal || !node.isExternal)
  );
  if (!eligibleNodes.length) {
    return renderHierarchyUnavailable(config, settings, "No terms matched hierarchy.termTypes in the configured ontology.");
  }
  const eligibleById = new Map(eligibleNodes.map((node) => [node.id, node]));
  const hierarchyEdges = ontologyInfo.edges.filter(
    (edge) => settings.relations.includes(edge.relation) && eligibleById.has(edge.source) && eligibleById.has(edge.target)
  );
  const childrenByParent = new Map();
  const parentsByChild = new Map();
  for (const edge of hierarchyEdges) {
    if (!childrenByParent.has(edge.target)) {
      childrenByParent.set(edge.target, []);
    }
    childrenByParent.get(edge.target).push({ node: eligibleById.get(edge.source), edge });
    if (!parentsByChild.has(edge.source)) {
      parentsByChild.set(edge.source, []);
    }
    parentsByChild.get(edge.source).push(edge);
  }

  const descendantCache = new Map();
  const descendantCount = (nodeId, path = new Set()) => {
    if (descendantCache.has(nodeId)) {
      return descendantCache.get(nodeId);
    }
    if (path.has(nodeId)) {
      return 0;
    }
    const nextPath = new Set(path).add(nodeId);
    const descendants = new Set();
    for (const { node } of childrenByParent.get(nodeId) || []) {
      if (descendants.has(node.id)) {
        continue;
      }
      descendants.add(node.id);
      for (const descendantId of descendantIds(node.id, nextPath)) {
        descendants.add(descendantId);
      }
    }
    descendantCache.set(nodeId, descendants.size);
    return descendants.size;
  };
  const descendantIds = (nodeId, path = new Set()) => {
    if (path.has(nodeId)) {
      return [];
    }
    const nextPath = new Set(path).add(nodeId);
    const result = [];
    for (const { node } of childrenByParent.get(nodeId) || []) {
      result.push(node.id, ...descendantIds(node.id, nextPath));
    }
    return result;
  };
  const importance = (node) =>
    (childrenByParent.get(node.id)?.length || 0) * 100 + descendantCount(node.id) * 10 + (node.degree || 0);
  const sortImportant = (left, right) => importance(right) - importance(left) || collator.compare(left.qname, right.qname);

  const resolveRoot = (reference) =>
    eligibleNodes.find(
      (node) => node.id === reference || node.uri === reference || node.qname === reference || node.localName === reference
    );
  const configuredRoots = settings.rootTerms.map(resolveRoot).filter(Boolean);
  const inferredRoots = eligibleNodes.filter((node) => !(parentsByChild.get(node.id) || []).length).sort(sortImportant);
  const roots = (configuredRoots.length ? configuredRoots : inferredRoots.length ? inferredRoots : [...eligibleNodes].sort(sortImportant))
    .slice(0, settings.maxRoots);

  const selectedNodes = new Set();
  const selectedEdges = new Set();
  const selectBranch = (node, depth, path = new Set()) => {
    if (selectedNodes.size >= settings.maxNodes || path.has(node.id)) {
      return;
    }
    selectedNodes.add(node.id);
    if (depth >= settings.maxDepth) {
      return;
    }
    const children = [...(childrenByParent.get(node.id) || [])].sort((left, right) => sortImportant(left.node, right.node));
    let includedChildren = 0;
    for (const { node: child, edge } of children) {
      if (!settings.includeLeafTerms && !(childrenByParent.get(child.id)?.length || 0)) {
        continue;
      }
      if (includedChildren >= settings.maxChildrenPerNode || selectedNodes.size >= settings.maxNodes) {
        break;
      }
      selectedEdges.add(edge.id);
      selectBranch(child, depth + 1, new Set(path).add(node.id));
      includedChildren += 1;
    }
  };
  for (const root of roots) {
    selectBranch(root, 0);
    if (selectedNodes.size >= settings.maxNodes) {
      break;
    }
  }

  const selectedRootNodes = roots.filter((root) => selectedNodes.has(root.id));
  const selectedHierarchyEdges = hierarchyEdges.filter((edge) => selectedEdges.has(edge.id));
  const selectedNodeSet = new Set(selectedNodes);
  const propertyRelations = settings.includePropertyRelations
    ? ontologyInfo.edges
        .filter((edge) => settings.propertyRelations.includes(edge.relation) && selectedNodeSet.has(edge.target))
        .filter((edge) => ontologyInfo.nodes.find((node) => node.id === edge.source)?.termType.endsWith("Property"))
        .sort((left, right) => {
          const leftSource = ontologyInfo.nodes.find((node) => node.id === left.source);
          const rightSource = ontologyInfo.nodes.find((node) => node.id === right.source);
          return (rightSource?.degree || 0) - (leftSource?.degree || 0) || collator.compare(left.sourceQname, right.sourceQname);
        })
        .slice(0, settings.maxPropertyRelations)
    : [];

  if (!selectedRootNodes.length) {
    return renderHierarchyUnavailable(config, settings, "No hierarchy roots could be inferred. Add a qname or IRI to hierarchy.rootTerms, or broaden the configured hierarchy relations.");
  }

  const selectedChildrenByParent = new Map();
  for (const edge of selectedHierarchyEdges) {
    if (!selectedChildrenByParent.has(edge.target)) {
      selectedChildrenByParent.set(edge.target, []);
    }
    selectedChildrenByParent.get(edge.target).push({ node: eligibleById.get(edge.source), edge });
  }
  for (const children of selectedChildrenByParent.values()) {
    children.sort((left, right) => sortImportant(left.node, right.node));
  }

  const tree = selectedRootNodes
    .map((root) => renderHierarchyBranch(root, selectedChildrenByParent, config, new Set(), 0))
    .join("");
  const propertyLinkHtml = propertyRelations.length
    ? `
        <div class="hierarchy-links">
          <h3>Key Structural Relationships</h3>
          <ul>${propertyRelations
            .map((edge) => {
              const source = ontologyInfo.nodes.find((node) => node.id === edge.source);
              const target = ontologyInfo.nodes.find((node) => node.id === edge.target);
              return `<li>${referenceHierarchyTerm(source, config)} <span class="hierarchy-relation">${escapeHtml(RELATION_INFO[edge.relation] || edge.relation)}</span> ${referenceHierarchyTerm(target, config)}</li>`;
            })
            .join("")}</ul>
        </div>`
    : "";

  return `
    <section id="ontology-hierarchy" class="section reference-hierarchy">
      <div class="section-head">
        <div class="section-heading-row">
          <h2>${escapeHtml(settings.title)}</h2>
          ${howToLink(config, "reference")}
        </div>
        <p class="section-note">${escapeHtml(settings.description)}</p>
      </div>
      <div class="hierarchy-meta"><span>${selectedRootNodes.length} major branch${selectedRootNodes.length === 1 ? "" : "es"}</span><span>|</span><span>${selectedNodes.size} representative term${selectedNodes.size === 1 ? "" : "s"}</span>${propertyRelations.length ? `<span>|</span><span>${propertyRelations.length} structural link${propertyRelations.length === 1 ? "" : "s"}</span>` : ""}</div>
      <div class="hierarchy-grid">
        <div class="hierarchy-tree"><ul>${tree}</ul></div>
        ${propertyLinkHtml}
      </div>
    </section>`;
}

function renderHierarchyUnavailable(config, settings, message) {
  return `
    <section id="ontology-hierarchy" class="section reference-hierarchy">
      <div class="section-head">
        <div class="section-heading-row">
          <h2>${escapeHtml(settings.title)}</h2>
          ${howToLink(config, "reference")}
        </div>
        <p class="section-note">${escapeHtml(settings.description)}</p>
      </div>
      <div class="hierarchy-empty">${escapeHtml(message)} The overview is intentionally a summary, so it does not attempt to render every ontology term.</div>
    </section>`;
}

function renderHierarchyBranch(node, childrenByParent, config, path, depth) {
  if (!node || path.has(node.id)) {
    return "";
  }
  const nextPath = new Set(path).add(node.id);
  const children = (childrenByParent.get(node.id) || []).filter(({ node: child }) => !nextPath.has(child.id));
  const term = referenceHierarchyTerm(node, config);
  if (!children.length) {
    return `<li class="hierarchy-item hierarchy-item--leaf" data-depth="${depth}">${term}</li>`;
  }
  return `
    <li class="hierarchy-item" data-depth="${depth}">
      <details open>
        <summary>${term}<span class="hierarchy-child-count">${children.length}</span></summary>
        <ul>${children.map(({ node: child }) => renderHierarchyBranch(child, childrenByParent, config, nextPath, depth + 1)).join("")}</ul>
      </details>
    </li>`;
}

function referenceHierarchyTerm(node, config) {
  if (!node) {
    return "";
  }
  const displayLabel = node.label && node.label !== node.qname ? node.label : node.localName || node.qname;
  const qname = `<code>${escapeHtml(node.qname)}</code>`;
  const content = config.hierarchy.labelMode === "label"
    ? `<span>${escapeHtml(displayLabel)}</span>`
    : config.hierarchy.labelMode === "qname"
      ? qname
      : `<span>${escapeHtml(displayLabel)}</span> ${qname}`;
  if (!node.isExternal && config.features.termPages) {
    return `<a class="hierarchy-term" href="terms/${encodeURIComponent(node.localName || sanitizeFileName(node.qname))}.html">${content}</a>`;
  }
  return `<span class="hierarchy-term">${content}</span>`;
}

function writeTermPages(context) {
  const declaredNodes = context.ontologyInfo.nodes.filter((node) => !node.isExternal);
  writeText(path.join(TERMS_DIR, "index.html"), buildTermsIndexPage(context, declaredNodes));

  for (const node of declaredNodes) {
    const fileName = `${encodeURIComponent(node.localName || sanitizeFileName(node.qname))}.html`;
    writeText(path.join(TERMS_DIR, fileName), buildTermPage(context, node));
  }
}

function guideCode(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return `<pre class="guide-code"><code>${escapeHtml(source)}</code></pre>`;
}

function guideOptions(rows) {
  return `
    <div class="guide-options-wrap">
      <table class="guide-options">
        <thead><tr><th>Option</th><th>Description</th></tr></thead>
        <tbody>${rows
          .map(
            ([option, description]) => `<tr><th scope="row"><code>${escapeHtml(option)}</code></th><td>${escapeHtml(description)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`;
}

function guideComponentSection({ id, badge, title, description, options, example }) {
  return `
    <section id="${escapeHtml(id)}" class="section guide-section guide-component">
      <div class="section-head"><div><div class="term-badge">${escapeHtml(badge)}</div><h2>${escapeHtml(title)}</h2></div><p class="section-note">${escapeHtml(description)}</p></div>
      ${guideOptions(options)}
      <h3>Example</h3>
      <p class="guide-example-note">This example includes every option described in this component section. Remove optional entries you do not need.</p>
      ${guideCode(example)}
    </section>`;
}

function buildGuidePage(context) {
  const { config } = context;
  const configExample = {
    $schema: "./ocg.config.schema.json",
    project: {
      title: "Your Vocabulary",
      shortName: "YV",
      slug: "your-vocabulary",
      description: "What this vocabulary describes.",
      namespace: "https://example.org/vocab#",
      canonicalUri: "https://example.org/vocab",
      version: "1.0.0",
      maintainer: "Vocabulary Team"
    },
    sources: {
      ontology: "source/ontology/your-vocabulary.ttl",
      ontologyFormat: "auto",
      shapes: "source/shapes/your-vocabulary.shacl.ttl",
      shex: "source/shex/your-vocabulary.shex",
      spec: "source/spec/index.html",
      examples: [
        {
          key: "basic",
          label: "Basic Example",
          path: "source/examples/basic.ttl",
          description: "A small valid instance graph."
        }
      ],
      artifacts: [
        {
          key: "context",
          label: "Context JSON",
          path: "source/context.json",
          description: "Additional source documentation or metadata.",
          destinationName: "context.json"
        }
      ]
    },
    features: {
      referencePage: true,
      graphPage: true,
      termPages: true,
      rawViewer: true,
      overviewCards: true,
      hierarchyAsset: true,
      hierarchyOverview: true,
      specPage: true,
      usageGuidePage: true
    },
    hierarchy: {
      title: "Ontology Structure",
      description: "A curated overview of the main class and concept relationships.",
      termTypes: ["class", "concept"],
      relations: ["subClassOf", "broader"],
      rootTerms: [],
      maxRoots: 6,
      maxDepth: 3,
      maxChildrenPerNode: 6,
      maxNodes: 36,
      includeLeafTerms: true,
      includeExternal: false,
      includePropertyRelations: true,
      propertyRelations: ["domain", "range"],
      maxPropertyRelations: 12,
      labelMode: "label-and-qname"
    },
    graph: {
      defaultView: "custom",
      custom: {
        enabled: true,
        label: "Ontology Network",
        defaultMode: "predicate-nodes",
        modes: { predicateNodes: true, predicateEdges: true },
        layout: {
          iterations: 320,
          seed: 42,
          scalingRatio: 1.4,
          gravity: 1,
          linLogMode: false,
          preventOverlap: true,
          labelSpacing: 1.15
        },
        labels: {
          density: 1.5,
          gridCellSize: 90,
          renderedSizeThreshold: 2,
          forceAllUnder: 80
        }
      },
      webvowl: {
        enabled: true,
        serviceUrl: "https://service.tib.eu/webvowl/",
        ontologyUrl: "",
        height: 760
      },
      colors: {
        class: "#b7dcf6",
        objectProperty: "#bee7c3",
        datatypeProperty: "#f7d7ab",
        annotationProperty: "#f2c8cf",
        concept: "#d3c5f6",
        declaredTerm: "#e1e8ef",
        external: "#dfe6ee",
        subClassOf: "#1f6f92",
        domain: "#2f8040",
        range: "#ab6b22",
        broader: "#7b5ca7"
      }
    },
    theme: {
      fonts: {
        heading: "Space Grotesk",
        body: "IBM Plex Sans",
        mono: "IBM Plex Mono"
      },
      colors: {
        pageBackground: "#f6f1ea",
        pageBackgroundAlt: "#edf3f7",
        panelBackground: "#ffffff",
        cardBackground: "#ffffff",
        text: "#1d1f22",
        mutedText: "#5f6b7a",
        accent: "#1f6f78",
        accentStrong: "#13535a",
        border: "#d6dee6"
      }
    },
    site: {
      basePath: "/",
      hero: {
        kicker: "Forkable Vocabulary Template",
        headline: "Explore Your Vocabulary",
        body: "A short introduction shown on the home page."
      },
      resourcePanel: {
        title: "Published Artifacts",
        body: "A short explanation shown above the artifact links."
      },
      toc: {
        enabled: true,
        title: "On this page"
      },
      home: {
        actions: {
          reference: "Reference",
          graph: "Ontology Network",
          terms: "Browse Terms",
          specification: "Specification",
          ontology: "Ontology Source",
          shapes: "Validation Shapes",
          shex: "ShEx Schema"
        },
        metadata: {
          canonicalUri: "Vocabulary IRI",
          version: "Release",
          maintainer: "Maintained by",
          unspecified: "Not provided",
          copyNamespace: "Copy vocabulary namespace",
          namespaceCopied: "Vocabulary namespace copied",
          namespaceCopyUnavailable: "Vocabulary namespace could not be copied"
        },
        snapshot: {
          title: "Vocabulary at a Glance",
          body: "Counts are generated from the configured ontology source."
        },
        overview: {
          title: "Using This Vocabulary",
          body: "Add project-specific guidance above the configurable overview cards."
        },
        featuredTerms: {
          title: "Key Terms",
          body: "Highlight the concepts and properties visitors should understand first.",
          emptyBody: "No key terms are selected yet."
        },
        examples: {
          title: "Example Data",
          body: "Link to representative instance data or usage examples.",
          defaultDescription: "A configured example for this vocabulary.",
          linkText: "View Example"
        },
        viewer: {
          title: "Source Viewer",
          body: "Choose source files and their order with curation.viewerTabs.",
          viewFileText: "View Source",
          loadingText: "Loading source..."
        },
        artifacts: {
          ontologyLabel: "Ontology Source",
          ontologyDescription: "Primary ontology source published with the companion site.",
          shapesLabel: "Validation Shapes",
          shapesDescription: "Optional SHACL constraints package.",
          shexLabel: "ShEx Schema",
          shexDescription: "Optional ShEx schema file.",
          specificationLabel: "Specification Source",
          specificationDescription: "Source document for the optional ReSpec specification page.",
          additionalArtifactDescription: "Additional configured source artifact."
        }
      },
      overviewCards: [
        {
          title: "Card Title",
          body: "Card text shown on the home page.",
          linkText: "Learn More",
          linkHref: "usage-guide.html#home"
        }
      ],
      customSections: [
        {
          title: "Additional Context",
          body: "A custom narrative section for domain-specific guidance.",
          items: ["A supporting point", "Another supporting point"]
        }
      ],
      footer: {
        primary: "Your vocabulary companion site.",
        secondary: "Maintained by the Vocabulary Team."
      },
      generator: {
        repositoryUrl: "https://github.com/ecrum19/ocg",
        documentationUrl: "https://github.com/ecrum19/ocg#readme"
      }
    },
    curation: {
      featuredTerms: ["yv:ImportantClass", "yv:importantProperty"],
      autoFeaturedTerms: true,
      featuredTermLimit: 6,
      viewerTabs: []
    }
  };
  const configExampleHtml = escapeHtml(JSON.stringify(configExample, null, 2));
  const componentSections = [
    {
      id: "package-cli",
      badge: "Developer Workflow",
      title: "Package and CLI",
      description: "Installs OCG into an existing ontology repository and controls initialization, validation, generation, cleanup, and local preview.",
      options: [
        ["npm install --save-dev ontology-companion-generator", "Installs the OCG CLI and its RDF, Sigma.js, and Graphology runtime dependencies."],
        ["Node.js 22.19+", "Supported runtime floor for OCG; generated GitHub Actions workflows use Node.js 24."],
        ["ocg init --ontology path", "Creates an initial config, schema, Pages workflow, and npm scripts; namespace and common companion files are inferred when possible."],
        ["ocg init --force", "Replaces the generated ocg.config.json while preserving an existing schema and workflow."],
        ["ocg check", "Validates configuration, source paths, dependency assets, and ontology parsing without writing site output."],
        ["ocg build", "Generates the static site and vendors Sigma.js and Graphology browser bundles into site/assets/vendor/."],
        ["ocg dev", "Builds the site and serves it locally at http://127.0.0.1:4173/."],
        ["ocg clean", "Removes the generated site directory."],
        ["--config path", "Uses an alternate configuration file relative to the repository root."],
        ["--output path", "Writes generated output to an alternate directory instead of site/."],
        ["--host host / --port port", "Changes the host or port used by the local ocg dev server."]
      ],
      example: {
        scripts: {
          "ocg:check": "ocg check",
          "ocg:build": "ocg build",
          "ocg:dev": "ocg dev",
          "ocg:clean": "ocg clean"
        },
        commands: [
          "npm install --save-dev ontology-companion-generator",
          "npx ocg init --ontology vocab/my-vocabulary.ttl",
          "npm run ocg:check",
          "npm run ocg:build"
        ]
      }
    },
    {
      id: "project",
      badge: "Site Foundation",
      title: "Project Identity",
      description: "Metadata used by the header, home page, generated titles, term pages, and graph data.",
      options: [
        ["$schema", "Optional editor hint that points ocg.config.json to the bundled JSON Schema."],
        ["project.title", "Full vocabulary name shown in page titles and the site header."],
        ["project.shortName", "Short label used in the brand mark and compact headers."],
        ["project.slug", "Stable project identifier stored in the generated graph metadata."],
        ["project.description", "Default project summary used when page-specific copy is not supplied."],
        ["project.namespace", "Namespace IRI used to identify the vocabulary and copy from the home page."],
        ["project.canonicalUri", "Canonical vocabulary IRI shown in the ontology snapshot."],
        ["project.version", "Optional vocabulary version shown in the ontology snapshot."],
        ["project.maintainer", "Optional maintainer shown in the ontology snapshot."]
      ],
      example: configExample.project
    },
    {
      id: "home",
      badge: "Landing Page",
      title: "Home",
      description: "Controls all editorial landing-page copy and labels, including the repository-workflow heading, source controls, metadata, cards, featured terms, examples, and viewer.",
      options: [
        ["features.overviewCards", "Set to false to hide the configurable overview-card row."],
        ["site.hero.kicker", "Small eyebrow text above the home-page headline."],
        ["site.hero.headline", "Main home-page headline; falls back to project.title when empty."],
        ["site.hero.body", "Introductory home-page paragraph; falls back to project.description when empty."],
        ["site.resourcePanel.title", "Heading for the published-artifacts panel."],
        ["site.resourcePanel.body", "Supporting text for the published-artifacts panel."],
        ["site.home.actions", "Labels for the Reference, Graph, Terms, Specification, OWL Ontology, SHACL, and ShEx actions. Set reference, graph, terms, specification, ontology, shapes, and shex."],
        ["site.home.metadata", "Home metadata labels and namespace-copy status messages. Set canonicalUri, version, maintainer, unspecified, copyNamespace, namespaceCopied, and namespaceCopyUnavailable."],
        ["site.home.snapshot.title", "Heading above the ontology-derived metric cards."],
        ["site.home.snapshot.body", "Supporting copy above the ontology-derived metric cards."],
        ["site.home.overview.title", "Heading above site.overviewCards. Use this to replace Repository Workflow with vocabulary-specific guidance."],
        ["site.home.overview.body", "Supporting copy above site.overviewCards."],
        ["site.home.featuredTerms.title", "Heading for the featured ontology terms section."],
        ["site.home.featuredTerms.body", "Supporting copy for the featured ontology terms section."],
        ["site.home.featuredTerms.emptyBody", "Message displayed when there are no explicit or automatically selected featured terms."],
        ["site.home.examples.title", "Heading for the configured example-files section."],
        ["site.home.examples.body", "Supporting copy for the configured example-files section."],
        ["site.home.examples.defaultDescription", "Fallback description for an example without sources.examples[].description."],
        ["site.home.examples.linkText", "Action label for each example card."],
        ["site.home.viewer.title", "Heading for the raw source viewer."],
        ["site.home.viewer.body", "Supporting copy for the raw source viewer."],
        ["site.home.viewer.viewFileText", "Action label linking to the selected raw source file."],
        ["site.home.viewer.loadingText", "Temporary message displayed while the selected source file loads."],
        ["site.home.artifacts", "Fallback labels and descriptions for built-in ontology, SHACL, ShEx, and specification source assets. Set ontologyLabel/Description, shapesLabel/Description, shexLabel/Description, specificationLabel/Description, and additionalArtifactDescription."],
        ["site.overviewCards[].title", "Heading for a configurable home-page card."],
        ["site.overviewCards[].body", "Description shown inside a configurable home-page card."],
        ["site.overviewCards[].linkText", "Optional label for the card link."],
        ["site.overviewCards[].linkHref", "Optional relative or absolute destination for the card link."],
        ["site.customSections[].title", "Heading for an additional home-page section."],
        ["site.customSections[].body", "Paragraph displayed in an additional home-page section."],
        ["site.customSections[].items", "Optional list of supporting points displayed in that section."],
        ["curation.featuredTerms", "Optional array of ontology qnames to feature on the home page. When empty, OCG selects terms automatically."],
        ["curation.autoFeaturedTerms", "Set to false to hide automatic featured terms when no explicit featuredTerms are configured."],
        ["curation.featuredTermLimit", "Maximum number of terms selected automatically when featuredTerms is empty."],
      ],
      example: {
        features: { overviewCards: true },
        site: {
          hero: configExample.site.hero,
          resourcePanel: configExample.site.resourcePanel,
          home: configExample.site.home,
          overviewCards: configExample.site.overviewCards,
          customSections: configExample.site.customSections
        },
        curation: { featuredTerms: configExample.curation.featuredTerms }
      }
    },
    {
      id: "artifacts",
      badge: "Source Package",
      title: "Artifacts and Viewer",
      description: "Publishes configured source files into site/assets/ and controls which files appear in the raw artifact viewer. OCG does not scan arbitrary directories. Primary ontology support is limited to Turtle, RDF/XML, JSON-LD, and N-Triples; other ontology syntaxes are rejected.",
      options: [
        ["sources.ontology", "Required path to the primary OWL/RDF ontology source."],
        ["sources.ontologyFormat", "Format override: auto, turtle, rdfxml, jsonld, or ntriples. Auto uses the file extension; use an override for ambiguous extensions. TriG, N-Quads, N3, OWL Functional/Manchester/XML, OBO, arbitrary JSON/XML/YAML, CSV, and schema formats are not accepted."],
        ["sources.shapes", "Optional path to a SHACL shapes file."],
        ["sources.shex", "Optional path to a ShEx schema file."],
        ["sources.spec", "Optional source document for the ReSpec Specification page; it is also copied as a viewer artifact."],
        ["sources.examples[].key", "Stable key used by viewerTabs to select an example."],
        ["sources.examples[].label", "Human-readable example label shown in the artifact list and viewer."],
        ["sources.examples[].path", "Path to the example RDF or data file."],
        ["sources.examples[].description", "Optional explanation shown with the example artifact."],
        ["sources.artifacts[].key", "Stable key used as artifact:<key> in viewerTabs."],
        ["sources.artifacts[].label", "Human-readable label shown in the artifact viewer."],
        ["sources.artifacts[].path", "Path to any additional source file to copy into site/assets/."],
        ["sources.artifacts[].description", "Optional explanation shown with the additional artifact."],
        ["sources.artifacts[].destinationName", "Optional filename for the copied artifact; defaults to the source filename."],
        ["features.rawViewer", "Set to false to remove the raw artifact viewer from the home page."],
        ["features.hierarchyAsset", "Set to false to omit the generated ontology_hierarchy.ttl asset."],
        ["curation.viewerTabs", "Ordered source-asset keys to show in the raw viewer. Leave empty to show all source assets, or list keys such as ontology or artifact:context to curate the tabs. Config, schema, workflow, and guide assets are not viewer tabs."]
      ],
      example: {
        sources: {
          ontology: configExample.sources.ontology,
          shapes: configExample.sources.shapes,
          shex: configExample.sources.shex,
          spec: configExample.sources.spec,
          artifacts: configExample.sources.artifacts,
          examples: configExample.sources.examples
        },
        features: { rawViewer: true, hierarchyAsset: true },
        curation: { viewerTabs: configExample.curation.viewerTabs }
      }
    },
    {
      id: "reference",
      badge: "Generated Page",
      title: "Vocabulary Reference",
      description: "Generates a browsable reference page from terms declared in the configured ontology, with an optional curated hierarchy overview above the Classes section.",
      options: [
        ["features.referencePage", "Set to false to omit ontology-reference.html and its navigation link."],
        ["features.hierarchyOverview", "Set to true to show the generated hierarchy summary above the Classes section."],
        ["hierarchy.title", "Heading for the hierarchy overview."],
        ["hierarchy.description", "Supporting explanation shown below the hierarchy heading."],
        ["hierarchy.termTypes", "Term types eligible for hierarchy branches. Defaults to class and concept; objectProperty, datatypeProperty, annotationProperty, and declaredTerm can be added when useful."],
        ["hierarchy.relations", "Hierarchy predicates to follow: subClassOf and/or broader."],
        ["hierarchy.rootTerms", "Optional qnames, IRIs, or local names to use as the major roots. Empty means OCG infers roots."],
        ["hierarchy.maxRoots", "Maximum number of major branches shown."],
        ["hierarchy.maxDepth", "Maximum number of levels below each root."],
        ["hierarchy.maxChildrenPerNode", "Maximum representative child terms shown for each branch."],
        ["hierarchy.maxNodes", "Global cap on terms shown in the overview."],
        ["hierarchy.includeLeafTerms", "Whether leaf terms are retained. Set false to emphasize only branching structure."],
        ["hierarchy.includeExternal", "Whether external hierarchy terms may appear in the tree."],
        ["hierarchy.includePropertyRelations", "Whether a capped list of important domain/range links is shown beside the tree."],
        ["hierarchy.propertyRelations", "Property relationship types to summarize: domain and/or range."],
        ["hierarchy.maxPropertyRelations", "Maximum number of structural links shown beside the tree."],
        ["hierarchy.labelMode", "Term display: label, qname, or label-and-qname."],
      ],
      example: {
        features: { referencePage: true, hierarchyOverview: true },
        hierarchy: configExample.hierarchy
      }
    },
    {
      id: "graph",
      badge: "Interactive Page",
      title: "Ontology Graph",
      description: "Configures the Sigma.js Ontology Network, its ForceAtlas2 and overlap-removal layout, adaptive labels, predicate modes, interactions, WebVOWL, and graph colors.",
      options: [
        ["features.graphPage", "Set to false to omit ontology-graph.html and its navigation link."],
        ["graph.defaultView", "Initial representation: custom (displayed as Ontology Network by default) or webvowl. The selected representation must be enabled."],
        ["graph.custom.enabled", "Enables the generated Sigma.js graph."],
        ["graph.custom.label", "Label used for the generated Sigma.js representation in graph tabs and accessibility text."],
        ["graph.custom.defaultMode", "Initial custom mode: predicate-nodes or predicate-edges."],
        ["graph.custom.modes.predicateNodes", "Enables predicates as visible nodes, matching the VORD-style representation."],
        ["graph.custom.modes.predicateEdges", "Enables predicates as labeled edges between domain and range nodes."],
        ["graph.custom.layout.iterations", "Base ForceAtlas2 iteration count. OCG scales it by component size; increase it for difficult dense graphs."],
        ["graph.custom.layout.seed", "Deterministic integer seed used for stable initial positions across builds."],
        ["graph.custom.layout.scalingRatio", "Multiplier applied to Graphology's inferred ForceAtlas2 scaling. Higher values spread connected nodes farther apart."],
        ["graph.custom.layout.gravity", "ForceAtlas2 gravity keeping each connected component compact."],
        ["graph.custom.layout.linLogMode", "Uses ForceAtlas2 LinLog attraction to emphasize clusters; leave false for a more even ontology network."],
        ["graph.custom.layout.preventOverlap", "Runs Graphology Noverlap after ForceAtlas2 using label-aware collision sizes."],
        ["graph.custom.layout.labelSpacing", "Multiplier for label collision spacing and component bounds."],
        ["graph.custom.labels.density", "Sigma label density for large graphs where every label is not forced."],
        ["graph.custom.labels.gridCellSize", "Sigma label-collision grid cell size in screen pixels."],
        ["graph.custom.labels.renderedSizeThreshold", "Minimum rendered node size before a non-forced label can appear."],
        ["graph.custom.labels.forceAllUnder", "For graphs at or below this node count, force every visible label. Larger graphs prioritize connected terms and reveal more labels when zoomed or selected."],
        ["graph.webvowl.enabled", "Enables the WebVOWL representation toggle."],
        ["graph.webvowl.serviceUrl", "WebVOWL service URL loaded by the graph iframe."],
        ["graph.webvowl.ontologyUrl", "Optional public URL of the serialized ontology document; leave empty to derive the deployed asset URL. Do not use project.namespace or a URL ending in #."],
        ["graph.webvowl.height", "Iframe height in pixels; minimum value is 320."],
        ["graph.colors.class", "Fill color for class nodes."],
        ["graph.colors.objectProperty", "Fill color for object-property nodes."],
        ["graph.colors.datatypeProperty", "Fill color for datatype-property nodes."],
        ["graph.colors.annotationProperty", "Fill color for annotation-property nodes."],
        ["graph.colors.concept", "Fill color for SKOS concept nodes."],
        ["graph.colors.declaredTerm", "Fill color for other declared-term nodes."],
        ["graph.colors.external", "Fill color for external reference nodes."],
        ["graph.colors.subClassOf", "Edge color for subclass relationships."],
        ["graph.colors.domain", "Edge color for domain relationships."],
        ["graph.colors.range", "Edge color for range relationships."],
        ["graph.colors.broader", "Edge color for broader/concept hierarchy relationships."]
      ],
      example: configExample.graph
    },
    {
      id: "terms",
      badge: "Generated Pages",
      title: "Term Pages",
      description: "Creates one HTML page for each declared ontology term, with relationships and source links.",
      options: [["features.termPages", "Set to false to omit the terms directory and its navigation link."]],
      example: { features: { termPages: true } }
    },
    {
      id: "specification",
      badge: "Optional Page",
      title: "ReSpec Specification",
      description: "Publishes a source ReSpec document as a first-class companion page with injected navigation.",
      options: [
        ["features.specPage", "Set to true to generate spec/index.html and its navigation link."],
        ["sources.spec", "Path to the ReSpec HTML source; required when specPage is enabled."]
      ],
      example: {
        sources: { spec: configExample.sources.spec },
        features: { specPage: true }
      }
    },
    {
      id: "usage-guide",
      badge: "Optional Page",
      title: "Usage Guide",
      description: "Generates this in-app configuration and workflow guide with component-specific How To links.",
      options: [["features.usageGuidePage", "Set to false to omit usage-guide.html, its navigation link, and all How To links."]],
      example: { features: { usageGuidePage: true } }
    },
    {
      id: "branding",
      badge: "Shared Styling",
      title: "Theme, Page Navigation, Footer, and Generator Links",
      description: "Applies site-wide fonts, colors, page table-of-contents behavior, footer copy, and OCG attribution links.",
      options: [
        ["site.basePath", "Deployment base-path setting retained for repository configuration; generated links are currently relative."],
        ["theme.fonts.heading", "Font family for headings and brand text."],
        ["theme.fonts.body", "Font family for body copy and interface text."],
        ["theme.fonts.mono", "Font family for code, IRIs, and source content."],
        ["theme.colors.pageBackground", "Main page background color."],
        ["theme.colors.pageBackgroundAlt", "Secondary page background color used by the layered background."],
        ["theme.colors.panelBackground", "Base panel background color."],
        ["theme.colors.cardBackground", "Base card background color."],
        ["theme.colors.text", "Primary text and heading color."],
        ["theme.colors.mutedText", "Secondary text color."],
        ["theme.colors.accent", "Primary link and accent color."],
        ["theme.colors.accentStrong", "Strong accent color for active and emphasized controls."],
        ["theme.colors.border", "Shared border color."],
        ["site.toc.enabled", "Set to false to remove the contextual table of contents from Home, Reference, and term-detail pages."],
        ["site.toc.title", "Heading for the contextual table of contents. It is collapsible and is shown only when a page has multiple sections."],
        ["site.footer.primary", "Primary footer sentence."],
        ["site.footer.secondary", "Secondary footer sentence."],
        ["site.generator.repositoryUrl", "Optional link to the OCG repository in the generated footer."],
        ["site.generator.documentationUrl", "Optional link to OCG documentation in the generated footer."]
      ],
      example: {
        site: {
          basePath: configExample.site.basePath,
          toc: configExample.site.toc,
          footer: configExample.site.footer,
          generator: configExample.site.generator
        },
        theme: configExample.theme
      }
    }
  ];
  const componentSectionsHtml = componentSections.map(guideComponentSection).join("");
  const guideTocItems = [
    { id: "existing-repository", label: "Existing Repository Integration", level: 0, marker: "01" },
    { id: "getting-started", label: "Getting Started", level: 0, marker: "02" },
    { id: "repository-layout", label: "Repository Layout", level: 0, marker: "03" },
    { id: "accepted-input-formats", label: "Accepted Input Formats", level: 0, marker: "04" },
    { id: "components", label: "Component Overview", level: 0, marker: "05" },
    ...componentSections.map(({ id, title }) => ({ id, label: title, level: 1, marker: "" })),
    { id: "configuration", label: "Complete Configuration", level: 0, marker: "06" },
    { id: "github-pages", label: "GitHub Pages", level: 0, marker: "07" },
    { id: "commands", label: "Useful Commands", level: 0, marker: "08" }
  ];
  const guideToc = `
    <details class="guide-toc" open>
      <summary class="guide-toc-summary">
        <span class="guide-toc-heading"><h2>Contents</h2></span>
        <span class="guide-toc-toggle" aria-hidden="true"></span>
      </summary>
      <nav class="guide-toc-nav" aria-label="Usage Guide table of contents">
        <ol class="guide-toc-list">${guideTocItems
          .map(
            ({ id, label, level, marker }) => `<li class="guide-toc-item guide-toc-item--level-${level}"><a class="guide-toc-link" href="#${escapeHtml(id)}"><span class="guide-toc-marker" aria-hidden="true">${marker}</span><span>${escapeHtml(label)}</span></a></li>`
          )
          .join("")}</ol>
      </nav>
    </details>`;

  return renderPage({
    config,
    title: `${config.project.title} Usage Guide`,
    description: `Usage guide for the ${config.project.title} companion site.`,
    currentNav: "guide",
    pathPrefix: "",
    content: `
      <section class="guide-hero section">
        ${guideToc}
        <div class="guide-hero-copy">
          <div class="eyebrow">Usage Guide</div>
          <h1>Guide to generating an ontology companion site using OCG.</h1>
          <p>This guide shows how to add OCG to an existing ontology repository, point it at your current source files, customize the generated pages, and publish the companion site from that repository's <code>main</code> branch.</p>
          <div class="guide-quick-links">
            <a class="btn btn--primary" href="#existing-repository">Integrate OCG</a>
            <a class="btn btn--ghost" href="#configuration">Configure OCG</a>
            <a class="btn btn--ghost" href="#components">Explore Generated Components</a>
          </div>
        </div>
      </section>

      <section id="existing-repository" class="section guide-section">
        <div class="section-head"><h2>Existing Repository Integration</h2><p class="section-note">Keep your ontology repository as the source of truth and install OCG alongside it.</p></div>
        <ol class="guide-steps">
          <li><strong>Install the package.</strong> Run <code>npm install --save-dev ontology-companion-generator</code>. The package supplies the generator, schema fallback, branding, Sigma.js, Graphology, and RDF parser dependencies.</li>
          <li><strong>Initialize the repository.</strong> Run <code>npx ocg init --ontology vocab/my-vocabulary.ttl</code>. OCG creates the config, schema, Pages workflow, and npm scripts, and attempts to infer the namespace and common companion files.</li>
          <li><strong>Review and customize the config.</strong> Paths in <code>sources</code> are relative to the repository root, so an existing <code>vocab/</code>, <code>shapes/</code>, <code>shex/</code>, <code>examples/</code>, or <code>spec/</code> layout can remain unchanged.</li>
          <li><strong>Validate and build.</strong> Run <code>npm run ocg:check</code>, then <code>npm run ocg:build</code>. Use <code>npm run ocg:dev</code> to inspect the generated site locally.</li>
          <li><strong>Publish from main.</strong> Enable GitHub Actions as the Pages source and push <code>main</code>. Feature branches should build and validate without deploying over the live site.</li>
        </ol>
        <h3>Existing source layout example</h3>
        ${guideCode({
          sources: {
            ontology: "vocab/my-vocabulary.ttl",
            ontologyFormat: "turtle",
            shapes: "shapes/my-vocabulary.shacl.ttl",
            shex: "shex/my-vocabulary.shex",
            spec: "spec/index.html",
            examples: [
              {
                key: "basic",
                label: "Basic Example",
                path: "examples/basic.ttl",
                description: "A minimal valid instance graph."
              }
            ]
          }
        })}
        <h3>Required integration files</h3>
        ${guideOptions([
          ["ocg.config.json", "Project-specific metadata, source paths, feature switches, graph settings, theme, and curation."],
          ["package.json + package-lock.json", "The OCG package and its locked dependencies."],
          [".github/workflows/publish-pages.yml", "Builds and deploys site/ from main through GitHub Pages."],
          ["ocg.config.schema.json", "Optional local copy created by ocg init for editor completion."]
        ])}
        <div class="guide-callout"><strong>Do not copy OCG internals into the ontology repository.</strong> The installed package owns the generator code and browser assets. The ontology repository owns the config, source files, package manifest, workflow, and generated site.</div>
      </section>

      <section id="getting-started" class="section guide-section">
        <div class="section-head"><h2>Getting Started</h2><p class="section-note">The primary workflow adds OCG to an existing ontology repository; forking this repository is an optional alternative.</p></div>
        <ol class="guide-steps">
          <li><strong>Keep your existing source layout.</strong> OCG can use ontology, SHACL, ShEx, example, and ReSpec files wherever they already live in the repository.</li>
          <li><strong>Update the config.</strong> Change project metadata, source paths, feature switches, graph options, theme, landing-page copy, and generator links in <code>ocg.config.json</code>.</li>
          <li><strong>Build locally.</strong> Run <code>npm run ocg:build</code> to regenerate <code>site/</code> and vendor the Sigma.js/Graphology browser bundles under <code>site/assets/vendor/</code>, then inspect the pages.</li>
          <li><strong>Publish with GitHub Pages.</strong> Push the ontology repository's <code>main</code> branch. The workflow rebuilds and deploys <code>site/</code> through GitHub Actions.</li>
        </ol>
      </section>

      <section id="repository-layout" class="section guide-section">
        <div class="section-head"><h2>Repository Layout</h2><p class="section-note">OCG support files can sit beside an existing ontology layout; source paths do not need to use source/.</p></div>
        <pre class="guide-code"><code>.
├── ocg.config.json
├── ocg.config.schema.json
├── package.json             # contains the OCG dependency and scripts
├── package-lock.json
├── vocab/                   # existing ontology files
├── shapes/                  # existing SHACL files
├── shex/                    # existing ShEx files
├── examples/                # existing instance data
├── spec/                    # existing ReSpec source
└── site/                   # generated, do not edit by hand</code></pre>
      </section>

      <section id="accepted-input-formats" class="section guide-section">
        <div class="section-head"><h2>Accepted Input Formats</h2><p class="section-note">OCG currently parses a deliberately small set of RDF serializations for the primary ontology.</p></div>
        ${guideOptions([
          ["Turtle", "Accepted extensions: .ttl and .turtle. Auto-detected as text/turtle."],
          ["RDF/XML", "Accepted extensions: .rdf, .rdfxml, and .owl. Auto-detected as application/rdf+xml."],
          ["JSON-LD", "Accepted extension: .jsonld. Auto-detected as application/ld+json."],
          ["N-Triples", "Accepted extensions: .nt and .ntriples. Auto-detected as application/n-triples."],
          ["sources.ontologyFormat", "Use auto for extension detection or explicitly set turtle, rdfxml, jsonld, or ntriples when needed."],
          ["Optional source files", "SHACL, ShEx, example, and ReSpec files are copied or published as configured. They are not currently parsed into the generated ontology graph."]
        ])}
        <div class="guide-callout"><strong>Not currently accepted as primary ontology inputs:</strong> TriG, N-Quads, N3, OWL Functional Syntax, Manchester OWL Syntax, OWL/XML, OBO, arbitrary XML/JSON/YAML, CSV, UML/XMI, JSON Schema, OpenAPI, and Protobuf. OCG rejects these instead of guessing a semantic mapping.</div>
        ${guideCode({
          sources: {
            ontology: "source/ontology/my-vocabulary.jsonld",
            ontologyFormat: "jsonld"
          }
        })}
      </section>

      <section id="components" class="section guide-section">
        <div class="section-head"><h2>Companion Site Components</h2><p class="section-note">Use the component-level How To links throughout the site to return directly to these explanations. Each detailed section includes an option table and a complete example.</p></div>
        <div class="guide-grid">
          <article id="package-cli-summary" class="guide-card"><div class="term-badge">Developer Workflow</div><h3><a href="#package-cli">Package and CLI</a></h3><p>Install OCG as a development dependency and use the CLI to initialize, validate, build, preview, and clean the companion site.</p><p><strong>Customize:</strong> CLI paths, output directory, local preview host, and the full <code>ocg.config.json</code> surface.</p></article>
          <article id="home-summary" class="guide-card"><div class="term-badge">Landing Page</div><h3><a href="#home">Home</a></h3><p>The home page presents your project identity, navigation, source artifacts, ontology snapshot, configurable overview cards, featured terms, examples, and the raw artifact viewer.</p><p><strong>Customize:</strong> <code>site.hero</code>, <code>site.resourcePanel</code>, <code>site.overviewCards</code>, <code>site.customSections</code>, and <code>curation.featuredTerms</code>.</p></article>
          <article id="artifacts-summary" class="guide-card"><div class="term-badge">Source Package</div><h3><a href="#artifacts">Artifacts and Viewer</a></h3><p>OWL Ontology, SHACL, ShEx, specification, examples, and additional configured source files are copied into <code>site/assets/</code>. Config, schema, workflow, and guide files are available as generated links but are not raw-viewer tabs.</p><p><strong>Customize:</strong> <code>sources</code>, <code>features.rawViewer</code>, and <code>curation.viewerTabs</code>.</p></article>
          <article id="reference-summary" class="guide-card"><div class="term-badge">Generated Page</div><h3><a href="#reference">Vocabulary Reference</a></h3><p>The reference page extracts declared terms from the configured ontology and groups them by class, property, concept, and declared-term type.</p><p><strong>Enable or disable:</strong> <code>features.referencePage</code>.</p></article>
          <article id="graph-summary" class="guide-card"><div class="term-badge">Interactive Page</div><h3><a href="#graph">Ontology Graph</a></h3><p>The Ontology Network supports <strong>Predicates as Nodes</strong> or <strong>Predicates as Edges</strong>, plus filters, search, selection, layout, and external-term visibility. Its full-screen view gives the network the full viewport and provides a collapsible controls drawer. WebVOWL can be enabled alongside it and expanded the same way.</p><p><strong>Customize:</strong> <code>graph.custom</code>, <code>graph.webvowl</code>, and <code>graph.colors</code>.</p></article>
          <article id="terms-summary" class="guide-card"><div class="term-badge">Generated Pages</div><h3><a href="#terms">Term Pages</a></h3><p>Every declared ontology term can receive an individual page with its IRI, labels, types, source links, and incoming/outgoing relationships.</p><p><strong>Enable or disable:</strong> <code>features.termPages</code>.</p></article>
          <article id="specification-summary" class="guide-card"><div class="term-badge">Optional Page</div><h3><a href="#specification">ReSpec Specification</a></h3><p>Place a ReSpec HTML document at <code>sources.spec</code>. OCG publishes it at <code>spec/index.html</code>, injects the companion navigation, and links it from the site.</p><p><strong>Enable or disable:</strong> <code>features.specPage</code>.</p></article>
          <article id="project-summary" class="guide-card"><div class="term-badge">Site Foundation</div><h3><a href="#project">Project Identity</a></h3><p>Project metadata supplies the shared title, namespace, version, and maintainer information used throughout the site.</p></article>
          <article id="usage-guide-summary" class="guide-card"><div class="term-badge">Optional Page</div><h3><a href="#usage-guide">Usage Guide</a></h3><p>The in-app guide can be enabled or disabled as a generated page and navigation destination.</p></article>
          <article id="branding-summary" class="guide-card"><div class="term-badge">Shared Styling</div><h3><a href="#branding">Theme and Footer</a></h3><p>Theme colors, fonts, footer copy, and OCG repository/documentation links are configured here.</p></article>
        </div>
      </section>

      ${componentSectionsHtml}

      <section id="configuration" class="section guide-section">
        <div class="section-head"><h2>Complete Configuration Example</h2><p class="section-note">The config is the primary customization surface. The schema file provides editor validation.</p></div>
        <pre class="guide-code"><code>${configExampleHtml}</code></pre>
      </section>

      <section id="github-pages" class="section guide-section">
        <div class="section-head"><h2>GitHub Pages Deployment</h2><p class="section-note">The included workflow builds the ontology repository on pushes to <code>main</code> and deploys the generated <code>site/</code> directory.</p></div>
        <div class="guide-callout"><strong>Required repository setting:</strong> in GitHub, open Settings → Pages and select GitHub Actions as the deployment source. The workflow intentionally deploys only <code>main</code> so feature branches cannot overwrite the live site.</div>
        <p>GitHub Pages does not dynamically follow the branch currently selected in the GitHub file browser. Deploying every branch would send each build to the same Pages site, with the latest deployment replacing the previous one. Build and test feature branches locally or with build-only CI, then merge to <code>main</code> for publication.</p>
      </section>

      <section id="commands" class="section guide-section">
        <div class="section-head"><h2>Useful Commands</h2><p class="section-note">Run these from the repository root.</p></div>
        <pre class="guide-code"><code>npm install --save-dev ontology-companion-generator
npx ocg init --ontology vocab/my-vocabulary.ttl
npm run ocg:check   # validate config and parse ontology
npm run ocg:build   # generate site/
npm run ocg:dev     # preview at http://127.0.0.1:4173/
npm run ocg:clean   # remove generated site/</code></pre>
      </section>
    `
  });
}

function resolveFeaturedTerms(config, ontologyInfo) {
  const declaredNodes = ontologyInfo.nodes.filter((node) => !node.isExternal);
  if (config.curation.featuredTerms.length) {
    return config.curation.featuredTerms
      .map((qname) => declaredNodes.find((node) => node.qname === qname))
      .filter(Boolean);
  }
  if (!config.curation.autoFeaturedTerms) {
    return [];
  }
  return declaredNodes.slice(0, config.curation.featuredTermLimit);
}

function buildIndexPage(context) {
  const { config, ontologyInfo, assets, relationshipSummary } = context;
  const home = config.site.home;
  const ontologyAsset = getAsset(assets, "ontology");
  const shapesAsset = getAsset(assets, "shapes");
  const shexAsset = getAsset(assets, "shex");
  const featuredTerms = resolveFeaturedTerms(config, ontologyInfo);

  const primaryHeroButtons = [
    config.features.referencePage
      ? `<a class="btn btn--primary" href="ontology-reference.html">${escapeHtml(home.actions.reference)}</a>`
      : "",
    config.features.graphPage
      ? `<a class="btn btn--ghost" href="ontology-graph.html">${escapeHtml(home.actions.graph)}</a>`
      : "",
    config.features.termPages
      ? `<a class="btn btn--ghost" href="terms/index.html">${escapeHtml(home.actions.terms)}</a>`
      : "",
    config.features.specPage && config.sources.spec
      ? `<a class="btn btn--ghost" href="spec/index.html">${escapeHtml(home.actions.specification)}</a>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  const artifactHeroButtons = [
    ontologyAsset ? `<a class="btn btn--ghost" href="${ontologyAsset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(home.actions.ontology)}</a>` : "",
    shapesAsset ? `<a class="btn btn--ghost" href="${shapesAsset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(home.actions.shapes)}</a>` : "",
    shexAsset ? `<a class="btn btn--ghost" href="${shexAsset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(home.actions.shex)}</a>` : ""
  ]
    .filter(Boolean)
    .join("");
  const artifactButtonCount = [ontologyAsset, shapesAsset, shexAsset].filter(Boolean).length;

  const heroButtons = `
    ${primaryHeroButtons ? `<div class="hero-action-group hero-action-group--primary">${primaryHeroButtons}</div>` : ""}
    ${artifactHeroButtons ? `<div class="hero-action-group hero-action-group--artifacts" style="--artifact-count: ${artifactButtonCount}">${artifactHeroButtons}</div>` : ""}
  `;

  const overviewCards = (config.site.overviewCards || [])
    .map(
      (card) => `
        <article class="card">
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.body)}</p>
          ${
            card.linkText && card.linkHref
              ? `<a class="card-link" href="${escapeHtml(card.linkHref)}" target="_blank" rel="noreferrer">${escapeHtml(card.linkText)}</a>`
              : ""
          }
        </article>
      `
    )
    .join("");

  const snapshotEntries = relationshipSummary.termCounts
    .filter((entry) => entry.count > 0 && entry.type !== "external")
  const statsCards = snapshotEntries
    .map(
      (entry) => `
        <article class="metric-card">
          <div class="metric-number">${entry.count}</div>
          <div class="metric-label">${escapeHtml(entry.label)}</div>
        </article>
      `
    )
    .join("");

  const featuredTermCards = featuredTerms.length
    ? featuredTerms
        .map(
          (term) => `
            <article class="card featured-term-card">
              <div class="term-badge">${escapeHtml(TERM_TYPE_INFO[term.termType].badge)}</div>
              <h3><a href="terms/${encodeURIComponent(term.localName)}.html">${escapeHtml(term.qname)}</a></h3>
              <p>${escapeHtml(term.comment || term.label)}</p>
            </article>
          `
        )
        .join("")
    : `<p class="section-note">${escapeHtml(home.featuredTerms.emptyBody)}</p>`;

  const exampleCards = (config.sources.examples || [])
    .map((example) => {
      const asset = getAsset(assets, `example:${example.key}`);
      return `
        <article class="card">
          <h3>${escapeHtml(example.label)}</h3>
          <p>${escapeHtml(example.description || home.examples.defaultDescription)}</p>
          <a class="card-link" href="${asset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(home.examples.linkText)}</a>
        </article>
      `;
    })
    .join("");

  const customSections = (config.site.customSections || [])
    .map(
      (section, index) => `
        <section id="custom-section-${index + 1}" class="section">
          <div class="section-head">
            <h2>${escapeHtml(section.title)}</h2>
            ${section.body ? `<p class="section-note">${escapeHtml(section.body)}</p>` : ""}
          </div>
          ${
            section.items?.length
              ? `<ul class="plain-list">${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : ""
          }
        </section>
      `
    )
    .join("");

  const viewerSection = config.features.rawViewer ? buildRawViewerSection(context) : "";
  const hasOverviewCards = Boolean(config.features.overviewCards && overviewCards);
  const hasExamples = Boolean(exampleCards);
  const hasViewerSection = Boolean(viewerSection.trim());
  const pageToc = [
    { id: "ontology-snapshot", label: home.snapshot.title },
    ...(hasOverviewCards ? [{ id: "repository-workflow", label: home.overview.title }] : []),
    { id: "featured-terms", label: home.featuredTerms.title },
    ...(hasExamples ? [{ id: "examples", label: home.examples.title }] : []),
    ...(hasViewerSection ? [{ id: "artifact-viewer", label: home.viewer.title }] : []),
    ...(config.site.customSections || []).map((section, index) => ({
      id: `custom-section-${index + 1}`,
      label: section.title
    }))
  ];

  const content = `
    <section class="hero">
      <div class="hero-copy">
        ${config.site.hero.kicker ? `<div class="eyebrow">${escapeHtml(config.site.hero.kicker)}</div>` : ""}
        <h1>${escapeHtml(config.site.hero.headline || config.project.title)}</h1>
        <p>${escapeHtml(config.site.hero.body || config.project.description)}</p>
        <div class="hero-actions">${heroButtons}</div>
      </div>
      <aside class="hero-panel">
        <div class="section-heading-row">
          <h2>${escapeHtml(config.site.resourcePanel.title)}</h2>
          ${howToLink(config, "artifacts")}
        </div>
        <p>${escapeHtml(config.site.resourcePanel.body)}</p>
        <dl class="meta-grid">
          <div class="meta-item--namespace">
            <dd class="namespace-value">
              <code>${escapeHtml(config.project.namespace)}</code>
              <button class="icon-button" id="copy-namespace" type="button" aria-label="${escapeHtml(home.metadata.copyNamespace)}" title="${escapeHtml(home.metadata.copyNamespace)}">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="9" y="9" width="10" height="10" rx="2"></rect>
                  <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path>
                </svg>
              </button>
            </dd>
          </div>
          <div class="meta-item--canonical">
            <dt>${escapeHtml(home.metadata.canonicalUri)}</dt>
            <dd><code>${escapeHtml(config.project.canonicalUri)}</code></dd>
          </div>
          <div>
            <dt>${escapeHtml(home.metadata.version)}</dt>
            <dd>${escapeHtml(config.project.version || home.metadata.unspecified)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(home.metadata.maintainer)}</dt>
            <dd>${escapeHtml(config.project.maintainer || home.metadata.unspecified)}</dd>
          </div>
        </dl>
      </aside>
    </section>

    <section id="ontology-snapshot" class="section">
      <div class="section-head">
        <div class="section-heading-row">
          <h2>${escapeHtml(home.snapshot.title)}</h2>
          ${howToLink(config, "home")}
        </div>
        <p class="section-note">${escapeHtml(home.snapshot.body)}</p>
      </div>
      <div class="metrics-grid" style="--metric-count: ${Math.max(1, snapshotEntries.length)}">${statsCards}</div>
    </section>

    ${
      hasOverviewCards
        ? `
          <section id="repository-workflow" class="section section--overview">
            <div class="section-head">
              <h2>${escapeHtml(home.overview.title)}</h2>
              <p class="section-note">${escapeHtml(home.overview.body)}</p>
            </div>
            <div class="card-grid">${overviewCards}</div>
          </section>
        `
        : ""
    }

    <section id="featured-terms" class="section">
      <div class="section-head">
        <h2>${escapeHtml(home.featuredTerms.title)}</h2>
        <p class="section-note">${escapeHtml(home.featuredTerms.body)}</p>
      </div>
      <div class="card-grid featured-terms-grid">${featuredTermCards}</div>
    </section>

    ${
      hasExamples
        ? `
          <section id="examples" class="section">
            <div class="section-head">
              <h2>${escapeHtml(home.examples.title)}</h2>
              <p class="section-note">${escapeHtml(home.examples.body)}</p>
            </div>
            <div class="card-grid">${exampleCards}</div>
          </section>
        `
        : ""
    }

    ${viewerSection}
    ${customSections}
    <script>
      const copyNamespaceButton = document.getElementById("copy-namespace");
      if (copyNamespaceButton) {
        copyNamespaceButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(${JSON.stringify(config.project.namespace)});
            copyNamespaceButton.dataset.copied = "true";
            copyNamespaceButton.setAttribute("aria-label", ${JSON.stringify(home.metadata.namespaceCopied)});
            copyNamespaceButton.title = ${JSON.stringify(home.metadata.namespaceCopied)};
            window.setTimeout(() => {
              copyNamespaceButton.dataset.copied = "false";
              copyNamespaceButton.setAttribute("aria-label", ${JSON.stringify(home.metadata.copyNamespace)});
              copyNamespaceButton.title = ${JSON.stringify(home.metadata.copyNamespace)};
            }, 1600);
          } catch {
            copyNamespaceButton.setAttribute("aria-label", ${JSON.stringify(home.metadata.namespaceCopyUnavailable)});
            copyNamespaceButton.title = ${JSON.stringify(home.metadata.namespaceCopyUnavailable)};
          }
        });
      }
    </script>
  `;

  return renderPage({
    config,
    title: `${config.project.title} Companion Site`,
    description: config.project.description,
    bodyClass: "page-home",
    currentNav: "home",
    pathPrefix: "",
    pageToc,
    content
  });
}

function buildRawViewerSection(context) {
  const { config, assets } = context;
  const viewerCopy = config.site.home.viewer;
  const viewerAssets = assets.filter((asset) => VIEWER_ASSET_KINDS.has(asset.kind));
  const keys = config.curation.viewerTabs.length
    ? config.curation.viewerTabs
    : viewerAssets.map((asset) => asset.key);

  const tabs = keys
    .map((key) => assets.find((asset) => asset.key === key))
    .filter((asset) => asset && VIEWER_ASSET_KINDS.has(asset.kind));

  if (!tabs.length) {
    return "";
  }

  const buttons = tabs
    .map(
      (asset, index) => `
        <button class="tab${index === 0 ? " active" : ""}" type="button" data-file="${asset.publicPath}" data-label="${escapeHtml(asset.label)}" data-description="${escapeHtml(asset.description)}">
          ${escapeHtml(asset.label)}
        </button>
      `
    )
    .join("");

  return `
    <section id="artifact-viewer" class="section">
      <div class="section-head">
        <div class="section-heading-row">
          <h2>${escapeHtml(viewerCopy.title)}</h2>
          ${howToLink(config, "artifacts")}
        </div>
        <p class="section-note">${escapeHtml(viewerCopy.body)}</p>
      </div>
      <div class="viewer">
        <div class="tabs">${buttons}</div>
        <div class="viewer-head">
          <div>
            <strong id="viewer-label">${escapeHtml(tabs[0].label)}</strong>
            <div class="viewer-note" id="viewer-description">${escapeHtml(tabs[0].description || "")}</div>
          </div>
          <a class="btn btn--ghost btn--small" id="viewer-open" href="${tabs[0].publicPath}" target="_blank" rel="noreferrer">${escapeHtml(viewerCopy.viewFileText)}</a>
        </div>
        <pre class="viewer-pane"><code id="viewer-code">${escapeHtml(viewerCopy.loadingText)}</code></pre>
      </div>
      <script>
        const viewerTabs = Array.from(document.querySelectorAll(".tab"));
        const viewerCode = document.getElementById("viewer-code");
        const viewerLabel = document.getElementById("viewer-label");
        const viewerDescription = document.getElementById("viewer-description");
        const viewerOpen = document.getElementById("viewer-open");

        async function loadArtifact(file, label, description, button) {
          viewerTabs.forEach((tab) => tab.classList.remove("active"));
          button.classList.add("active");
          viewerLabel.textContent = label;
          viewerDescription.textContent = description || "";
          viewerOpen.href = file;
          viewerCode.textContent = ${JSON.stringify(viewerCopy.loadingText)};
          const response = await fetch(file);
          const text = await response.text();
          viewerCode.textContent = text;
        }

        viewerTabs.forEach((button) => {
          button.addEventListener("click", () => {
            loadArtifact(
              button.dataset.file,
              button.dataset.label,
              button.dataset.description,
              button
            );
          });
        });

        if (viewerTabs[0]) {
          loadArtifact(
            viewerTabs[0].dataset.file,
            viewerTabs[0].dataset.label,
            viewerTabs[0].dataset.description,
            viewerTabs[0]
          );
        }
      </script>
    </section>
  `;
}

function buildReferencePage(context) {
  const { config, ontologyInfo } = context;
  const declaredNodes = ontologyInfo.nodes.filter((node) => !node.isExternal);
  const sectionDefinitions = ["class", "objectProperty", "datatypeProperty", "annotationProperty", "concept", "declaredTerm"]
    .map((type) => ({ type, nodes: declaredNodes.filter((node) => node.termType === type) }))
    .filter(({ nodes }) => nodes.length);
  const sections = sectionDefinitions
    .map(({ type, nodes }) => {

      const rows = nodes
        .map((node) => {
          const relations = describeRelations(node, ontologyInfo);
          return `
            <tr>
              <td><a href="terms/${encodeURIComponent(node.localName)}.html"><code>${escapeHtml(node.qname)}</code></a></td>
              <td>${escapeHtml(node.label)}</td>
              <td>${escapeHtml(relations)}</td>
              <td>${escapeHtml(node.comment || "-")}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <section id="reference-${type}" class="section">
          <div class="section-head">
            <h2>${escapeHtml(pluralTermTypeLabel(type))}</h2>
            <p class="section-note">Declared ontology terms extracted from the configured primary source file.</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Label</th>
                  <th>Relationships</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");
  const hierarchySection = buildReferenceHierarchy(context);
  const pageToc = [
    { id: "reference-overview", label: "Overview" },
    ...(hierarchySection.trim() ? [{ id: "ontology-hierarchy", label: config.hierarchy.title }] : []),
    ...sectionDefinitions.map(({ type }) => ({ id: `reference-${type}`, label: pluralTermTypeLabel(type) }))
  ];

  return renderPage({
    config,
    title: `${config.project.title} Reference`,
    description: `Reference documentation for ${config.project.title}.`,
    currentNav: "reference",
    pathPrefix: "",
    pageToc,
    content: `
      <section id="reference-overview" class="section">
        <div class="section-head">
          <div class="section-heading-row">
            <h1>Vocabulary Reference</h1>
            ${howToLink(config, "reference")}
          </div>
          <p class="section-note">This page is generated from the configured ontology file and links through to per-term pages when that feature is enabled.</p>
        </div>
      </section>
      ${hierarchySection}
      ${sections}
    `
  });
}

function pluralTermTypeLabel(type) {
  return {
    class: "Classes",
    objectProperty: "Object Properties",
    datatypeProperty: "Datatype Properties",
    annotationProperty: "Annotation Properties",
    concept: "Concepts",
    declaredTerm: "Declared Terms",
    external: "External References"
  }[type] || TERM_TYPE_INFO[type].label;
}

function buildGraphPage(context) {
  const { config, ontologyInfo, assets } = context;
  const customEnabled = config.graph.custom.enabled;
  const webvowlEnabled = config.graph.webvowl.enabled;
  const ontologyAsset = getAsset(assets, "ontology");
  const webvowlHeight = Number.isFinite(config.graph.webvowl.height) ? config.graph.webvowl.height : 760;
  const webvowlSettings = JSON.stringify({
    serviceUrl: config.graph.webvowl.serviceUrl,
    ontologyUrl: config.graph.webvowl.ontologyUrl,
    ontologyAssetPath: ontologyAsset.publicPath
  });
  const customModeDefinitions = [
    {
      key: "predicate-nodes",
      label: "Predicates as Nodes",
      enabled: config.graph.custom.modes.predicateNodes
    },
    {
      key: "predicate-edges",
      label: "Predicates as Edges",
      enabled: config.graph.custom.modes.predicateEdges
    }
  ];
  const enabledCustomModes = customModeDefinitions.filter((mode) => mode.enabled);
  const customModeTabs = customEnabled && enabledCustomModes.length > 1
    ? `
        <div class="graph-mode-tabs" role="tablist" aria-label="Ontology Network mode">
          ${enabledCustomModes
            .map(
              (mode) => `<button class="graph-mode-tab" type="button" role="tab" data-custom-graph-mode="${mode.key}">${mode.label}</button>`
            )
            .join("")}
        </div>
      `
    : "";
  const graphViewTabs = customEnabled && webvowlEnabled
    ? `
        <div class="graph-view-tabs" role="tablist" aria-label="Graph representation">
          <button class="graph-view-tab" type="button" role="tab" data-graph-view="custom" aria-controls="custom-graph-panel">${escapeHtml(config.graph.custom.label)}</button>
          <button class="graph-view-tab" type="button" role="tab" data-graph-view="webvowl" aria-controls="webvowl-graph-panel">WebVOWL</button>
        </div>
      `
    : "";
  const customPanel = customEnabled
    ? `
        <div id="custom-graph-panel" class="graph-view-panel sigma-graph-panel" role="tabpanel" aria-label="${escapeHtml(config.graph.custom.label)} Sigma graph">
          ${customModeTabs}
          <div class="sigma-layout">
            <aside id="sigma-sidebar" class="sigma-panel" aria-label="Ontology Network controls">
              <details class="sigma-block sigma-block--filters" open>
                <summary class="sigma-block-toggle">Filters <span class="sigma-chevron">▾</span></summary>
                <div class="sigma-block-body">
                  <p class="sigma-muted">Combine edge and node filters to focus a subgraph. Hidden nodes also remove their connected edges.</p>
                  <p class="sigma-filter-title">Edge Relationships</p>
                  <div id="sigma-edge-filters" class="sigma-control-group"></div>
                  <p class="sigma-filter-title">Node Types</p>
                  <div id="sigma-node-filters" class="sigma-control-group"></div>
                  <p class="sigma-filter-title">Display</p>
                  <label><input id="sigma-toggle-external" type="checkbox" checked /> Show external terms</label>
                  <label><input id="sigma-toggle-isolated" type="checkbox" checked /> Show isolated nodes</label>
                  <label><input id="sigma-toggle-labels" type="checkbox" checked /> Show node labels</label>
                </div>
              </details>

              <details class="sigma-block" open>
                <summary class="sigma-block-toggle">Search <span class="sigma-chevron">▾</span></summary>
                <div class="sigma-block-body">
                  <input id="sigma-term-search" class="sigma-search" type="search" placeholder="Search qname or label" list="sigma-term-options" />
                  <datalist id="sigma-term-options"></datalist>
                  <div class="sigma-search-actions">
                    <button id="sigma-focus-term" class="sigma-btn" type="button">Focus Term</button>
                    <button id="sigma-clear-selection" class="sigma-btn" type="button">Clear Selection</button>
                    <button id="sigma-reset-view" class="sigma-btn sigma-btn--reset" type="button">Reset View to Fit Graph</button>
                  </div>
                  <div id="sigma-status" class="sigma-status"></div>
                </div>
              </details>

              <details id="sigma-selection-block" class="sigma-block sigma-block--selection" open>
                <summary class="sigma-block-toggle">Selection Details <span class="sigma-chevron">▾</span></summary>
                <div class="sigma-block-body"><div id="sigma-term-detail" class="sigma-detail">Select a node to inspect relationships.</div></div>
              </details>

              <details class="sigma-block">
                <summary class="sigma-block-toggle">Graph Stats <span class="sigma-chevron">▾</span></summary>
                <div class="sigma-block-body"><div id="sigma-graph-stats" class="sigma-stats">Loading graph data...</div></div>
              </details>

              <details class="sigma-block">
                <summary class="sigma-block-toggle">Serialization Overview <span class="sigma-chevron">▾</span></summary>
                <div class="sigma-block-body"><div id="sigma-overview-summary" class="sigma-overview">Loading overview...</div></div>
              </details>
            </aside>

            <section class="sigma-card">
              <div class="sigma-graph-top">
                <div id="sigma-legend" class="sigma-legend" aria-label="Graph legend"></div>
                <div class="sigma-graph-hint">Hover nodes or edges for quick details. Click to select. Drag nodes to adjust layout.</div>
              </div>
              <div id="sigma-graph-container" aria-label="Sigma ontology graph">
                <div id="sigma-canvas" class="sigma-canvas"></div>
                <button id="sigma-toggle-controls" class="sigma-controls-toggle" type="button" data-sigma-controls-toggle aria-controls="sigma-sidebar" aria-expanded="true" aria-label="Hide graph controls" title="Hide graph controls">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h7"></path><circle cx="17" cy="12" r="2.5"></circle><circle cx="14" cy="19" r="2.5"></circle></svg>
                  <span data-sigma-controls-label>Hide controls</span>
                </button>
                <button class="graph-expand-btn graph-expand-btn--icon" type="button" data-graph-expand="custom-graph-panel" aria-controls="custom-graph-panel" aria-expanded="false" aria-label="Expand graph view" title="Expand graph view">
                  <svg data-graph-expand-icon="expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"></path></svg>
                  <svg data-graph-expand-icon="compress" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"></path></svg>
                </button>
                <span class="graph-expand-help" data-graph-expand-help hidden>Press Esc to exit full screen.</span>
                <div id="sigma-edge-tooltip" class="sigma-tooltip sigma-edge-tooltip"></div>
                <div id="sigma-node-tooltip" class="sigma-tooltip sigma-node-tooltip"></div>
              </div>
            </section>
          </div>
        </div>
      `
    : "";
  const webvowlPanel = webvowlEnabled
    ? `
        <div id="webvowl-graph-panel" class="graph-view-panel" role="tabpanel" aria-label="WebVOWL graph" hidden>
          <p class="graph-view-note">WebVOWL loads the configured ontology URL through the selected WebVOWL service. The default URL points to this site’s published ontology asset.</p>
          <div class="webvowl-graph-surface">
            <iframe id="webvowl-frame" class="webvowl-frame" title="WebVOWL ontology graph" loading="lazy" style="height: ${webvowlHeight}px"></iframe>
            <button class="graph-expand-btn graph-expand-btn--icon" type="button" data-graph-expand="webvowl-graph-panel" aria-controls="webvowl-graph-panel" aria-expanded="false" aria-label="Expand graph view" title="Expand graph view">
              <svg data-graph-expand-icon="expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"></path></svg>
              <svg data-graph-expand-icon="compress" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"></path></svg>
            </button>
            <span class="graph-expand-help" data-graph-expand-help hidden>Press Esc to exit full screen.</span>
          </div>
        </div>
      `
    : "";

  return renderPage({
    config,
    title: `${config.project.title} Graph`,
    description: `Interactive graph page for ${config.project.title}.`,
    currentNav: "graph",
    bodyClass: "page-graph",
    pathPrefix: "",
    content: `
      <section class="section">
        <div class="section-head">
          <div class="section-heading-row">
            <h1>Ontology Graph</h1>
            ${howToLink(config, "graph")}
          </div>
          <p class="section-note">Explore the configured ontology through the enabled graph representations.</p>
        </div>
        ${graphViewTabs}
        ${customPanel}
        ${webvowlPanel}
      </section>
      <script>
        const graphViewTabs = Array.from(document.querySelectorAll(".graph-view-tab"));
        const graphViewPanels = Array.from(document.querySelectorAll(".graph-view-panel"));
        const defaultGraphView = ${JSON.stringify(config.graph.defaultView)};
        const webvowlSettings = ${webvowlSettings};
        const webvowlFrame = document.getElementById("webvowl-frame");
        const graphExpandPanels = Array.from(document.querySelectorAll(".graph-view-panel"));

        function notifyGraphViewportChange(panel) {
          window.dispatchEvent(new Event("resize"));
          [120, 420].forEach((delay) => {
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent("ocg:graph-viewport-change", { detail: { panelId: panel.id } }));
            }, delay);
          });
        }

        function setGraphControlsCollapsed(panel, collapsed) {
          if (panel.id !== "custom-graph-panel") return;
          const button = panel.querySelector("[data-sigma-controls-toggle]");
          const label = panel.querySelector("[data-sigma-controls-label]");
          panel.classList.toggle("graph-controls-collapsed", collapsed);
          button?.setAttribute("aria-expanded", String(!collapsed));
          button?.setAttribute("aria-label", collapsed ? "Show graph controls" : "Hide graph controls");
          if (button) button.title = collapsed ? "Show graph controls" : "Hide graph controls";
          if (label) label.textContent = collapsed ? "Show controls" : "Hide controls";
          notifyGraphViewportChange(panel);
        }

        function updateGraphExpandControl(panel, expanded) {
          const button = panel.querySelector("[data-graph-expand]");
          const help = panel.querySelector("[data-graph-expand-help]");
          const expandIcon = panel.querySelector('[data-graph-expand-icon="expand"]');
          const compressIcon = panel.querySelector('[data-graph-expand-icon="compress"]');
          if (!button) return;
          button.setAttribute("aria-expanded", String(expanded));
          button.setAttribute("aria-label", expanded ? "Exit full screen" : "Expand graph view");
          button.title = expanded ? "Exit full screen (Esc)" : "Expand graph view";
          if (expandIcon) expandIcon.hidden = expanded;
          if (compressIcon) compressIcon.hidden = !expanded;
          if (help) help.hidden = !expanded;
        }

        function syncGraphExpandState() {
          const nativePanel = graphExpandPanels.find((panel) => document.fullscreenElement === panel) || null;
          const fallbackPanel = graphExpandPanels.find((panel) => panel.classList.contains("graph-panel--expanded")) || null;
          const activePanel = nativePanel || fallbackPanel;
          document.body.classList.toggle("graph-fullscreen-active", Boolean(activePanel));
          graphExpandPanels.forEach((panel) => updateGraphExpandControl(panel, panel === activePanel));
          if (!activePanel) {
            graphExpandPanels.forEach((panel) => setGraphControlsCollapsed(panel, false));
          }
        }

        async function exitGraphPanel(panel) {
          panel.classList.remove("graph-panel--expanded");
          setGraphControlsCollapsed(panel, false);
          if (document.fullscreenElement === panel && typeof document.exitFullscreen === "function") {
            try {
              await document.exitFullscreen();
            } catch (error) {
              console.warn("Unable to exit browser full screen mode.", error);
            }
          }
          syncGraphExpandState();
        }

        async function enterGraphPanel(panel) {
          setGraphControlsCollapsed(panel, panel.id === "custom-graph-panel");
          try {
            if (document.fullscreenElement && document.fullscreenElement !== panel && typeof document.exitFullscreen === "function") {
              await document.exitFullscreen();
            }
            if (typeof panel.requestFullscreen !== "function") {
              throw new Error("Fullscreen API unavailable");
            }
            await panel.requestFullscreen();
          } catch (error) {
            panel.classList.add("graph-panel--expanded");
          }
          syncGraphExpandState();
          notifyGraphViewportChange(panel);
        }

        async function toggleGraphPanel(panel) {
          const expanded = document.fullscreenElement === panel || panel.classList.contains("graph-panel--expanded");
          if (expanded) {
            await exitGraphPanel(panel);
          } else {
            await enterGraphPanel(panel);
          }
        }

        graphExpandPanels.forEach((panel) => {
          panel.querySelector("[data-graph-expand]")?.addEventListener("click", (event) => {
            event.stopPropagation();
            void toggleGraphPanel(panel);
          });
          panel.querySelector("[data-sigma-controls-toggle]")?.addEventListener("click", (event) => {
            event.stopPropagation();
            setGraphControlsCollapsed(panel, !panel.classList.contains("graph-controls-collapsed"));
          });
        });
        document.addEventListener("fullscreenchange", syncGraphExpandState);
        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape" || document.fullscreenElement) return;
          const fallbackPanel = graphExpandPanels.find((panel) => panel.classList.contains("graph-panel--expanded"));
          if (fallbackPanel) {
            event.preventDefault();
            void exitGraphPanel(fallbackPanel);
          }
        });
        syncGraphExpandState();

        function selectGraphView(view) {
          graphViewTabs.forEach((tab) => {
            const isActive = tab.dataset.graphView === view;
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-selected", String(isActive));
          });
          graphViewPanels.forEach((panel) => {
            panel.hidden = panel.id !== view + "-graph-panel";
          });
          if (view === "webvowl" && webvowlFrame && webvowlFrame.dataset.loaded !== "true") {
            const sourceUrl = webvowlSettings.ontologyUrl || new URL(webvowlSettings.ontologyAssetPath, window.location.href).href;
            const serviceUrl = new URL(webvowlSettings.serviceUrl);
            serviceUrl.hash = "iri=" + encodeURIComponent(sourceUrl);
            webvowlFrame.src = serviceUrl.toString();
            webvowlFrame.dataset.loaded = "true";
          }
        }

        graphViewTabs.forEach((tab) => {
          tab.addEventListener("click", () => selectGraphView(tab.dataset.graphView));
        });

        selectGraphView(defaultGraphView);
      </script>
      ${customEnabled ? buildSigmaGraphScript(config) : ""}
    `
  });
}

function buildSigmaGraphScript(config) {
  const typeLabels = Object.fromEntries(
    Object.entries(TERM_TYPE_INFO).map(([type, info]) => [type, info.label])
  );
  const enabledCustomModes = [
    { key: "predicate-nodes", enabled: config.graph.custom.modes.predicateNodes },
    { key: "predicate-edges", enabled: config.graph.custom.modes.predicateEdges }
  ].filter((mode) => mode.enabled);
  const typePlurals = {
    class: "classes",
    objectProperty: "object properties",
    datatypeProperty: "datatype properties",
    annotationProperty: "annotation properties",
    concept: "concepts",
    declaredTerm: "declared terms",
    external: "external terms"
  };
  return `
      <script src="assets/vendor/graphology.umd.min.js"></script>
      <script src="assets/vendor/sigma.min.js"></script>
      <script>
        (() => {
          const TYPE_COLOR = ${JSON.stringify(config.graph.colors)};
          const TYPE_LABEL = ${JSON.stringify(typeLabels)};
          const TYPE_PLURAL = ${JSON.stringify(typePlurals)};
          const RELATION_LABEL = ${JSON.stringify(RELATION_INFO)};
          const RELATION_ORDER = ["subClassOf", "domain", "range", "broader", "predicate"];
          const CUSTOM_MODE_LABEL = { "predicate-nodes": "Predicates as Nodes", "predicate-edges": "Predicates as Edges" };
          const ENABLED_CUSTOM_MODES = ${JSON.stringify(
            enabledCustomModes.map((mode) => mode.key)
          )};
          const DEFAULT_CUSTOM_MODE = ${JSON.stringify(config.graph.custom.defaultMode)};
          const LABEL_SETTINGS = ${JSON.stringify(config.graph.custom.labels)};
          const LABEL_FONT = ${JSON.stringify(config.theme.fonts.body)};
          const EDGE_DIM_SIZE = 0.8;
          const EDGE_BASE_SIZE = 2.6;
          const EDGE_HIT_TOLERANCE = 14;

          const container = document.getElementById("sigma-canvas");
          const sidebarEl = document.getElementById("sigma-sidebar");
          const legendEl = document.getElementById("sigma-legend");
          const edgeFiltersEl = document.getElementById("sigma-edge-filters");
          const nodeFiltersEl = document.getElementById("sigma-node-filters");
          const statsEl = document.getElementById("sigma-graph-stats");
          const detailEl = document.getElementById("sigma-term-detail");
          const detailBlockEl = document.getElementById("sigma-selection-block");
          const overviewEl = document.getElementById("sigma-overview-summary");
          const edgeTooltipEl = document.getElementById("sigma-edge-tooltip");
          const nodeTooltipEl = document.getElementById("sigma-node-tooltip");
          const statusEl = document.getElementById("sigma-status");

          let graphPayload;
          let graphData;
          let overviewData;
          let activeCustomMode = DEFAULT_CUSTOM_MODE;
          let graph;
          let renderer;
          let selectedNode = null;
          let selectedEdge = null;
          let selectedNeighborhood = new Set();
          let selectedEdgeEndpoints = new Set();
          let visibleNodes = new Set();
          let visibleEdges = new Set();
          let edgeById = new Map();
          let nodeById = new Map();
          let draggedNode = null;
          let draggingNode = false;
          let dragStartedAt = null;
          let dragMoved = false;
          let suppressNextClick = false;
          let suppressClickReleaseScheduled = false;
          let labelMeasureContext = null;
          let interactionAbortController = null;
          let containerResizeObserver = null;
          let containerResizeFitTimer = null;

          function escapeHtml(value) {
            return String(value ?? "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#39;");
          }

          function hexToRgba(hex, alpha) {
            const source = String(hex || "#dfe6ee").replace("#", "");
            const value = source.length === 3 ? source.split("").map((part) => part + part).join("") : source;
            const intValue = parseInt(value, 16);
            const r = (intValue >> 16) & 255;
            const g = (intValue >> 8) & 255;
            const b = intValue & 255;
            return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
          }

          function setStatus(message) {
            statusEl.textContent = message || "";
          }

          function toViewportPoint(eventLike) {
            if (!eventLike) {
              return null;
            }
            const original = eventLike.original || eventLike;
            if (eventLike.original && typeof eventLike.x === "number" && typeof eventLike.y === "number") {
              return { x: eventLike.x, y: eventLike.y };
            }
            if (original && typeof original.clientX === "number" && typeof original.clientY === "number") {
              const rect = container.getBoundingClientRect();
              return { x: original.clientX - rect.left, y: original.clientY - rect.top };
            }
            if (typeof eventLike.x === "number" && typeof eventLike.y === "number") {
              return { x: eventLike.x, y: eventLike.y };
            }
            return null;
          }

          function shouldSuppressClick() {
            if (!suppressNextClick) {
              return false;
            }
            if (!suppressClickReleaseScheduled) {
              suppressClickReleaseScheduled = true;
              window.setTimeout(() => {
                suppressNextClick = false;
                suppressClickReleaseScheduled = false;
              }, 0);
            }
            return true;
          }

          function pointToSegmentDistance(point, start, end) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            if (dx === 0 && dy === 0) {
              return Math.hypot(point.x - start.x, point.y - start.y);
            }
            const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
          }

          function findNearbyEdge(point, tolerance = EDGE_HIT_TOLERANCE) {
            if (!graph || !renderer || !point) {
              return null;
            }
            let nearest = null;
            let nearestDistance = tolerance;
            graph.forEachEdge((edge, attributes, sourceId, targetId) => {
              if (!visibleEdges.has(edge)) {
                return;
              }
              const source = renderer.graphToViewport(graph.getNodeAttributes(sourceId));
              const target = renderer.graphToViewport(graph.getNodeAttributes(targetId));
              const distance = pointToSegmentDistance(point, source, target);
              if (distance <= nearestDistance) {
                nearest = edge;
                nearestDistance = distance;
              }
            });
            return nearest;
          }

          function getNodeLabelPlacement(nodeX, nodeRadius, textWidth, viewportWidth) {
            const gap = 4;
            const rightX = nodeX + nodeRadius + gap;
            const leftX = nodeX - nodeRadius - gap;
            const rightWouldClip = rightX + textWidth + 10 > viewportWidth;
            const leftHasRoom = leftX - textWidth - 10 >= 0;
            if (rightWouldClip && leftHasRoom) {
              return { x: leftX, left: leftX - textWidth, right: leftX, align: "right" };
            }
            return { x: rightX, left: rightX, right: rightX + textWidth, align: "left" };
          }

          function getNodeAtPoint(point) {
            if (!point || !renderer) return null;
            const physicalNode = typeof renderer.getNodeAtPosition === "function"
              ? renderer.getNodeAtPosition(point)
              : null;
            if (physicalNode && visibleNodes.has(physicalNode)) return physicalNode;
            if (typeof renderer.getNodeDisplayData !== "function") return null;
            if (!labelMeasureContext) {
              labelMeasureContext = document.createElement("canvas").getContext("2d");
            }
            if (!labelMeasureContext) return null;
            const settings = renderer.getSettings?.() || {};
            if (settings.renderLabels === false) return null;
            labelMeasureContext.font = (settings.labelWeight || "normal") + " " + (settings.labelSize || 14) + "px " + (settings.labelFont || "Arial");
            const labelSize = Number(settings.labelSize) || 14;
            let nearestNode = null;
            let nearestDistance = Infinity;
            graph.forEachNode((nodeId) => {
              if (!visibleNodes.has(nodeId)) return;
              const displayData = renderer.getNodeDisplayData(nodeId);
              const nodeAttributes = graph.getNodeAttributes(nodeId);
              const label = displayData?.label || nodeAttributes.label;
              if (!label || displayData?.hidden) return;
              const nodePoint = renderer.graphToViewport(nodeAttributes);
              const nodeRadius = Number(displayData?.size || nodeAttributes.size || 7);
              const textWidth = labelMeasureContext.measureText(label).width;
              const placement = getNodeLabelPlacement(nodePoint.x, nodeRadius, textWidth, container.clientWidth);
              const left = placement.left - 5;
              const right = placement.right + 5;
              const baseline = nodePoint.y + labelSize / 3;
              const top = baseline - labelSize * 0.85 - 5;
              const bottom = baseline + labelSize * 0.35 + 5;
              if (point.x < left || point.x > right || point.y < top || point.y > bottom) return;
              const distance = Math.hypot(point.x - nodePoint.x, point.y - nodePoint.y);
              if (distance < nearestDistance) {
                nearestNode = nodeId;
                nearestDistance = distance;
              }
            });
            return nearestNode;
          }

          function updateFallbackHover(payload) {
            const point = toViewportPoint(payload);
            if (!point || draggingNode || !renderer) {
              return;
            }
            const nextNode = getNodeAtPoint(point);
            const nextEdge = nextNode ? null : findNearbyEdge(point);
            if (nextNode) {
              edgeTooltipEl.classList.remove("visible");
              edgeTooltipEl.innerHTML = "";
              updateNodeTooltip(nextNode, { event: payload });
              return;
            }
            if (nextEdge) {
              clearNodeTooltip();
              updateEdgeHoverInfo(nextEdge, { event: payload });
              return;
            }
            clearNodeTooltip();
            if (selectedEdge) {
              updateEdgeHoverInfo(selectedEdge, null, true);
            } else {
              clearEdgeHoverInfo();
            }
          }

          function setCustomMode(mode, initializing = false) {
            if (!ENABLED_CUSTOM_MODES.includes(mode) || !graphPayload) {
              return;
            }
            activeCustomMode = mode;
            const modeData = graphPayload.modes?.[mode] || {
              nodes: graphPayload.nodes,
              edges: graphPayload.edges,
              stats: graphPayload.stats
            };
            graphData = { ...graphPayload, ...modeData };
            edgeById = new Map(graphData.edges.map((edge, index) => [edge.id || "rel-" + String(index + 1).padStart(3, "0"), edge]));
            nodeById = new Map(graphData.nodes.map((node) => [node.id, node]));
            selectedNode = null;
            selectedEdge = null;
            selectedNeighborhood = new Set();
            selectedEdgeEndpoints = new Set();
            if (renderer) {
              renderer.kill();
              container.querySelectorAll("canvas").forEach((canvas) => canvas.remove());
            }
            renderControls();
            if (!initializing) {
              setupDynamicControlInteractions();
            }
            buildGraph();
            updateStats();
            updateOverview();
            updateDetail(null);
            clearEdgeHoverInfo();
            clearNodeTooltip();
            document.querySelectorAll("[data-custom-graph-mode]").forEach((tab) => {
              const isActive = tab.dataset.customGraphMode === activeCustomMode;
              tab.classList.toggle("active", isActive);
              tab.setAttribute("aria-selected", String(isActive));
            });
            if (renderer && !initializing) {
              setupRendererInteractions();
              fitCamera(false);
              renderer.refresh();
            }
            setStatus("Graph loaded in " + (CUSTOM_MODE_LABEL[activeCustomMode] || activeCustomMode) + " mode.");
          }

          function qnameNode(nodeId) {
            const node = nodeById.get(nodeId);
            return node ? node.qname : nodeId;
          }

          function relationLabel(relation) {
            return RELATION_LABEL[relation] || relation;
          }

          function termLink(nodeId) {
            const node = nodeById.get(nodeId);
            if (!node) {
              return escapeHtml(nodeId);
            }
            const text = escapeHtml(node.qname);
            if (node.isExternal) {
              return "<a href=\\\"" + escapeHtml(node.uri) + "\\\" target=\\\"_blank\\\" rel=\\\"noreferrer\\\">" + text + "</a>";
            }
            return "<a href=\\\"terms/" + encodeURIComponent(node.localName || node.qname) + ".html\\\">" + text + "</a>";
          }

          function getFilterState() {
            return {
              relations: new Set(Array.from(document.querySelectorAll("[data-sigma-relation]:checked")).map((input) => input.value)),
              nodeTypes: new Set(Array.from(document.querySelectorAll("[data-sigma-node-type]:checked")).map((input) => input.value)),
              showExternal: document.getElementById("sigma-toggle-external").checked,
              showIsolated: document.getElementById("sigma-toggle-isolated").checked,
              showLabels: document.getElementById("sigma-toggle-labels").checked,
              searchTerm: document.getElementById("sigma-term-search").value.trim().toLowerCase()
            };
          }

          function renderControls() {
            const relations = [...new Set(graphData.edges.map((edge) => edge.relation))].sort((a, b) => {
              const aIndex = RELATION_ORDER.indexOf(a);
              const bIndex = RELATION_ORDER.indexOf(b);
              return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
            });
            edgeFiltersEl.innerHTML = relations.map((relation) =>
              "<label><input type=\\\"checkbox\\\" data-sigma-relation=\\\"true\\\" value=\\\"" + escapeHtml(relation) + "\\\" checked /> Show <code>" + escapeHtml(relationLabel(relation)) + "</code></label>"
            ).join("");

            const nodeTypes = [...new Set(graphData.nodes.filter((node) => !node.isExternal).map((node) => node.termType))].sort((a, b) => (TYPE_LABEL[a] || a).localeCompare(TYPE_LABEL[b] || b));
            nodeFiltersEl.innerHTML = nodeTypes.map((type) =>
              "<label><input type=\\\"checkbox\\\" data-sigma-node-type=\\\"true\\\" value=\\\"" + escapeHtml(type) + "\\\" checked /> Show " + escapeHtml(TYPE_PLURAL[type] || (TYPE_LABEL[type] || type).toLowerCase()) + "</label>"
            ).join("");

            const optionsEl = document.getElementById("sigma-term-options");
            optionsEl.innerHTML = "";
            graphData.nodes.filter((node) => !node.isExternal).sort((a, b) => a.qname.localeCompare(b.qname)).forEach((node) => {
              const option = document.createElement("option");
              option.value = node.qname;
              optionsEl.appendChild(option);
            });

            const legendTypes = graphData.nodes.some((node) => node.isExternal) ? [...nodeTypes, "external"] : nodeTypes;
            legendEl.innerHTML = "<span class=\\\"sigma-legend-title\\\">Legend</span>" +
              legendTypes.map((type) => "<span class=\\\"sigma-legend-chip\\\"><span class=\\\"sigma-swatch\\\" style=\\\"background:" + (TYPE_COLOR[type] || TYPE_COLOR.declaredTerm) + ";\\\"></span>" + escapeHtml(TYPE_LABEL[type] || type) + "</span>").join("") +
              relations.map((relation) => "<span class=\\\"sigma-legend-chip\\\"><span class=\\\"sigma-line\\\" style=\\\"--line-color:" + (TYPE_COLOR[relation] || "#6f8394") + ";\\\"><svg viewBox=\\\"0 0 28 10\\\" aria-hidden=\\\"true\\\"><path d=\\\"M1 5H20\\\" stroke=\\\"currentColor\\\" stroke-width=\\\"3.8\\\" stroke-linecap=\\\"round\\\"></path><path d=\\\"M20 1L27 5L20 9Z\\\" fill=\\\"currentColor\\\"></path></svg></span>" + escapeHtml(relationLabel(relation)) + "</span>").join("");
          }

          function recomputeVisibility() {
            const filters = getFilterState();
            visibleNodes = new Set(graphData.nodes.filter((node) => {
              if (!node.isExternal && !filters.nodeTypes.has(node.termType)) {
                return false;
              }
              if (!filters.showExternal && node.isExternal) {
                return false;
              }
              return true;
            }).map((node) => node.id));

            visibleEdges = new Set(graphData.edges.filter((edge) =>
              filters.relations.has(edge.relation) && visibleNodes.has(edge.source) && visibleNodes.has(edge.target)
            ).map((edge) => edge.id));

            if (!filters.showIsolated) {
              const connected = new Set();
              graphData.edges.forEach((edge) => {
                if (visibleEdges.has(edge.id)) {
                  connected.add(edge.source);
                  connected.add(edge.target);
                }
              });
              visibleNodes = new Set(Array.from(visibleNodes).filter((id) => connected.has(id)));
              visibleEdges = new Set(Array.from(visibleEdges).filter((id) => {
                const edge = edgeById.get(id);
                return visibleNodes.has(edge.source) && visibleNodes.has(edge.target);
              }));
            }
          }

          function refreshSelectionContext() {
            selectedNeighborhood = selectedNode && graph.hasNode(selectedNode)
              ? new Set([selectedNode, ...graph.neighbors(selectedNode)])
              : new Set();
            selectedEdgeEndpoints = selectedEdge && graph.hasEdge(selectedEdge)
              ? new Set([graph.source(selectedEdge), graph.target(selectedEdge)])
              : new Set();
          }

          function updateStats() {
            const filters = getFilterState();
            const typeCounts = {};
            graphData.nodes.filter((node) => visibleNodes.has(node.id)).forEach((node) => {
              typeCounts[node.termType] = (typeCounts[node.termType] || 0) + 1;
            });
            statsEl.innerHTML = "<div><strong>Visible nodes:</strong> " + visibleNodes.size + " / " + graphData.nodes.length + "</div>" +
              "<div><strong>Visible edges:</strong> " + visibleEdges.size + " / " + graphData.edges.length + "</div>" +
              Object.entries(typeCounts).map(([type, count]) => "<div>" + escapeHtml(TYPE_LABEL[type] || type) + ": " + count + "</div>").join("") +
              "<div><strong>Search:</strong> " + escapeHtml(filters.searchTerm || "none") + "</div>";
          }

          function updateOverview() {
            const relationCounts = {};
            graphData.edges.forEach((edge) => {
              relationCounts[edge.relation] = (relationCounts[edge.relation] || 0) + 1;
            });
            overviewEl.innerHTML = "<div><strong>Mode:</strong> " + escapeHtml(CUSTOM_MODE_LABEL[activeCustomMode] || activeCustomMode) + "</div>" +
              "<div><strong>Source:</strong> " + escapeHtml(overviewData?.source || graphData.source) + "</div>" +
              "<div><strong>Namespace:</strong> <code>" + escapeHtml(overviewData?.namespace || graphData.namespace) + "</code></div>" +
              "<div><strong>Serialized nodes:</strong> " + escapeHtml(graphData.nodes.length) + "</div>" +
              "<div><strong>Serialized edges:</strong> " + escapeHtml(graphData.edges.length) + "</div>" +
              "<div><strong>Relations:</strong> " + Object.entries(relationCounts).map(([relation, count]) => escapeHtml(relationLabel(relation)) + " (" + count + ")").join(", ") + "</div>";
          }

          function revealSelectionDetails() {
            detailBlockEl.open = true;
            window.requestAnimationFrame(() => {
              const inset = 8;
              const blockTop = detailBlockEl.offsetTop;
              const blockHeight = detailBlockEl.offsetHeight;
              const visibleTop = sidebarEl.scrollTop;
              const visibleBottom = visibleTop + sidebarEl.clientHeight;
              if (blockTop >= visibleTop + inset && blockTop + blockHeight <= visibleBottom - inset) return;
              const targetTop = blockHeight > sidebarEl.clientHeight - inset * 2
                ? blockTop - inset
                : blockTop + blockHeight - sidebarEl.clientHeight + inset;
              sidebarEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
            });
          }

          function updateDetail(nodeId) {
            if (!nodeId) {
              detailEl.innerHTML = "Select a node to inspect relationships.";
              return;
            }
            const node = nodeById.get(nodeId);
            const outgoingEdges = graphData.edges.filter((edge) => edge.source === nodeId);
            const incomingEdges = graphData.edges.filter((edge) => edge.target === nodeId);
            const outgoing = outgoingEdges.map((edge) =>
              "<li><span class=\\\"sigma-relation-kind\\\">" + escapeHtml(relationLabel(edge.relation)) + " →</span>" + termLink(edge.target) + "</li>"
            ).join("");
            const incoming = incomingEdges.map((edge) =>
              "<li><span class=\\\"sigma-relation-kind\\\">← " + escapeHtml(relationLabel(edge.relation)) + "</span>" + termLink(edge.source) + "</li>"
            ).join("");
            detailEl.innerHTML =
              "<div class=\\\"sigma-detail-heading\\\"><strong>" + escapeHtml(node.qname) + "</strong><span class=\\\"sigma-detail-type\\\">" + escapeHtml(TYPE_LABEL[node.termType] || node.termType) + "</span></div>" +
              (node.label && node.label !== node.qname ? "<div class=\\\"sigma-detail-label\\\">" + escapeHtml(node.label) + "</div>" : "") +
              (node.comment ? "<p class=\\\"sigma-detail-description\\\">" + escapeHtml(node.comment) + "</p>" : "") +
              "<section class=\\\"sigma-detail-group\\\"><div class=\\\"sigma-detail-group-title\\\"><span>Outgoing</span><span>" + outgoingEdges.length + "</span></div><ul>" + (outgoing || "<li class=\\\"sigma-detail-empty\\\">None</li>") + "</ul></section>" +
              "<section class=\\\"sigma-detail-group\\\"><div class=\\\"sigma-detail-group-title\\\"><span>Incoming</span><span>" + incomingEdges.length + "</span></div><ul>" + (incoming || "<li class=\\\"sigma-detail-empty\\\">None</li>") + "</ul></section>";
            revealSelectionDetails();
          }

          function updateDetailForEdge(edgeId) {
            const edge = edgeById.get(edgeId);
            if (!edge) {
              updateDetail(null);
              return;
            }
            detailEl.innerHTML =
              "<div class=\\\"sigma-detail-heading\\\"><strong>" + escapeHtml(edge.predicateQname || relationLabel(edge.relation)) + "</strong><span class=\\\"sigma-detail-type\\\">Relationship</span></div>" +
              "<dl class=\\\"sigma-detail-metadata\\\"><dt>Type</dt><dd>" + escapeHtml(relationLabel(edge.relation)) + "</dd><dt>From</dt><dd>" + termLink(edge.source) + "</dd><dt>To</dt><dd>" + termLink(edge.target) + "</dd></dl>";
            revealSelectionDetails();
          }

          function selectNode(nodeId) {
            if (!nodeId || !visibleNodes.has(nodeId)) {
              return;
            }
            if (selectedNode === nodeId) {
              clearSelection();
              return;
            }
            selectedNode = nodeId;
            selectedEdge = null;
            refreshSelectionContext();
            updateDetail(nodeId);
            clearEdgeHoverInfo();
            clearNodeTooltip();
            renderer.refresh();
            setStatus("Selected " + qnameNode(nodeId) + ".");
          }

          function selectEdge(edgeId) {
            if (!edgeId || !visibleEdges.has(edgeId)) {
              return;
            }
            if (selectedEdge === edgeId) {
              clearSelection();
              return;
            }
            selectedNode = null;
            selectedNeighborhood = new Set();
            selectedEdge = edgeId;
            refreshSelectionContext();
            updateDetailForEdge(edgeId);
            clearNodeTooltip();
            updateEdgeHoverInfo(edgeId, null, true);
            renderer.refresh();
            const edge = edgeById.get(edgeId);
            setStatus(edge ? "Selected edge: " + (edge.predicateQname || edge.relation) + "." : "Selected edge.");
          }

          function clearEdgeHoverInfo() {
            edgeTooltipEl.classList.remove("visible");
            edgeTooltipEl.innerHTML = "";
          }

          function clearNodeTooltip() {
            nodeTooltipEl.classList.remove("visible");
            nodeTooltipEl.innerHTML = "";
          }

          function updateEdgeHoverInfo(edgeId, payload, selected = false) {
            const edge = edgeById.get(edgeId);
            if (!edge) {
              clearEdgeHoverInfo();
              return;
            }
            const point = toViewportPoint(payload?.event || payload);
            if (!point) {
              edgeTooltipEl.classList.remove("visible");
              edgeTooltipEl.innerHTML = "";
              return;
            }
            const rect = container.getBoundingClientRect();
            edgeTooltipEl.style.left = Math.min(Math.max(8, rect.width - 340), Math.max(8, point.x + 12)) + "px";
            edgeTooltipEl.style.top = Math.min(Math.max(8, rect.height - 78), Math.max(8, point.y + 12)) + "px";
            edgeTooltipEl.innerHTML = "<div><strong>" + escapeHtml(edge.sourceQname) + " → " + escapeHtml(edge.targetQname) + "</strong></div><div><code>" + escapeHtml(edge.predicateQname || edge.relation) + "</code></div>";
            edgeTooltipEl.classList.add("visible");
          }

          function updateNodeTooltip(nodeId, payload) {
            const node = nodeById.get(nodeId);
            const point = toViewportPoint(payload?.event || payload);
            if (!node || !point) {
              clearNodeTooltip();
              return;
            }
            const rect = container.getBoundingClientRect();
            nodeTooltipEl.style.left = Math.min(Math.max(8, rect.width - 300), Math.max(8, point.x + 10)) + "px";
            nodeTooltipEl.style.top = Math.min(Math.max(8, rect.height - 74), Math.max(8, point.y + 10)) + "px";
            nodeTooltipEl.innerHTML = "<div><strong>" + escapeHtml(node.qname) + "</strong></div><div>" + escapeHtml(TYPE_LABEL[node.termType] || node.termType) + "</div>" + (node.label && node.label !== node.qname ? "<div>" + escapeHtml(node.label) + "</div>" : "") + (node.comment ? "<div>" + escapeHtml(node.comment) + "</div>" : "");
            nodeTooltipEl.classList.add("visible");
          }

          function setupReducers() {
            renderer.setSetting("nodeReducer", (node, attrs) => {
              if (!visibleNodes.has(node)) {
                return { ...attrs, hidden: true };
              }
              const filters = getFilterState();
              const result = {
                ...attrs,
                hidden: false,
                label: filters.showLabels ? attrs.qname : "",
                forceLabel: filters.showLabels && attrs.baseForceLabel,
                labelColor: "#253846"
              };
              const matchesQuery = !filters.searchTerm || attrs.qnameLower.includes(filters.searchTerm) || attrs.labelLower.includes(filters.searchTerm);
              if (!matchesQuery) {
                result.color = hexToRgba(attrs.baseColor, 0.2);
                result.labelColor = "#9aa6ae";
              }
              if (selectedEdge) {
                if (!selectedEdgeEndpoints.has(node)) {
                  result.color = hexToRgba(attrs.baseColor, 0.15);
                  result.labelColor = "#a4afb6";
                } else {
                  result.size = attrs.baseSize * 1.18;
                  result.color = attrs.baseColor;
                  result.forceLabel = filters.showLabels;
                  result.labelColor = "#142f3a";
                }
                return result;
              }
              if (selectedNode) {
                if (!selectedNeighborhood.has(node)) {
                  result.color = hexToRgba(attrs.baseColor, 0.17);
                  result.labelColor = "#a4afb6";
                } else if (selectedNode === node) {
                  result.size = attrs.baseSize * 1.22;
                  result.color = attrs.baseColor;
                  result.forceLabel = filters.showLabels;
                  result.labelColor = "#102f3b";
                } else {
                  result.forceLabel = filters.showLabels;
                  result.labelColor = "#294653";
                }
              }
              return result;
            });
            renderer.setSetting("edgeReducer", (edge, attrs) => {
              if (!visibleEdges.has(edge)) {
                return { ...attrs, hidden: true };
              }
              const result = { ...attrs, hidden: false };
              if (selectedEdge) {
                if (edge !== selectedEdge) {
                  result.color = "rgba(117, 127, 140, 0.16)";
                  result.size = EDGE_DIM_SIZE;
                } else {
                  result.size = attrs.baseSize * 1.7;
                  result.color = attrs.baseColor;
                  result.zIndex = 1;
                }
                return result;
              }
              if (selectedNode) {
                const adjacent = graph.source(edge) === selectedNode || graph.target(edge) === selectedNode;
                if (!adjacent) {
                  result.color = "rgba(117, 127, 140, 0.16)";
                  result.size = EDGE_DIM_SIZE;
                } else {
                  result.size = attrs.baseSize * 1.25;
                }
              }
              return result;
            });
          }

          function getLayoutBasis() {
            const nodes = graph.nodes();
            if (!nodes.length) return null;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodes.forEach((id) => {
              const attrs = graph.getNodeAttributes(id);
              minX = Math.min(minX, attrs.x); maxX = Math.max(maxX, attrs.x);
              minY = Math.min(minY, attrs.y); maxY = Math.max(maxY, attrs.y);
            });
            return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, span: Math.max(maxX - minX, maxY - minY, 1) };
          }

          function fitCamera(animate = true) {
            const nodes = graphData.nodes.filter((node) => visibleNodes.has(node.id));
            const basis = getLayoutBasis();
            if (!nodes.length || !basis) return;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodes.forEach((node) => {
              const attrs = graph.getNodeAttributes(node.id);
              minX = Math.min(minX, attrs.x); maxX = Math.max(maxX, attrs.x);
              minY = Math.min(minY, attrs.y); maxY = Math.max(maxY, attrs.y);
            });
            const span = Math.max(maxX - minX, maxY - minY, 1);
            const target = { x: 0.5 + ((minX + maxX) / 2 - basis.centerX) / basis.span, y: 0.5 + ((minY + maxY) / 2 - basis.centerY) / basis.span, ratio: Math.min(18, Math.max(0.04, (span / basis.span) * 1.18)), angle: 0 };
            const camera = renderer.getCamera();
            if (animate) camera.animate(target, { duration: 320 }); else camera.setState(target);
          }

          function refresh() {
            recomputeVisibility();
            refreshSelectionContext();
            updateStats();
            renderer.refresh();
          }

          function focusTerm() {
            const query = document.getElementById("sigma-term-search").value.trim().toLowerCase();
            const node = graphData.nodes.find((entry) => entry.qname.toLowerCase() === query || entry.label.toLowerCase() === query || entry.qname.toLowerCase().includes(query));
            if (!node) {
              setStatus("No matching term found.");
              return;
            }
            if (!visibleNodes.has(node.id)) {
              setStatus("Term exists but is hidden by current filters.");
              return;
            }
            selectedNode = node.id;
            selectedEdge = null;
            refreshSelectionContext();
            updateDetail(selectedNode);
            renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 0.18 }, { duration: 420 });
            renderer.refresh();
            setStatus("Focused " + node.qname + ".");
          }

          function clearSelection() {
            selectedNode = null;
            selectedEdge = null;
            selectedNeighborhood = new Set();
            selectedEdgeEndpoints = new Set();
            updateDetail(null);
            clearEdgeHoverInfo();
            clearNodeTooltip();
            renderer.refresh();
            setStatus("Selection cleared.");
          }

          function setupDragging(signal) {
            if (!renderer || typeof renderer.getMouseCaptor !== "function") return;
            const mouseCaptor = renderer.getMouseCaptor();
            if (!mouseCaptor || typeof mouseCaptor.on !== "function") return;
            const stopEvent = (eventLike) => {
              if (!eventLike) return;
              eventLike.preventSigmaDefault?.();
              const original = eventLike.original || eventLike;
              original.preventDefault?.();
              original.stopPropagation?.();
            };
            const endDrag = () => {
              if (!draggingNode) return;
              draggingNode = false;
              draggedNode = null;
              dragStartedAt = null;
              if (dragMoved) {
                suppressNextClick = true;
                setStatus("Layout updated by node drag.");
              }
              dragMoved = false;
              renderer.getCamera().enable();
            };
            const startDragging = (node, point, eventLike) => {
              if (!node || !visibleNodes.has(node) || draggingNode) return;
              draggedNode = node;
              draggingNode = true;
              dragMoved = false;
              dragStartedAt = point;
              renderer.getCamera().disable();
              stopEvent(eventLike);
            };
            renderer.on("downNode", (payload) => {
              if (!payload?.node || !visibleNodes.has(payload.node)) return;
              startDragging(payload.node, toViewportPoint(payload.event), payload.event);
            });
            mouseCaptor.on("mousedown", (payload) => {
              if (draggingNode) return;
              const point = toViewportPoint(payload);
              const node = getNodeAtPoint(point);
              startDragging(node, point, payload);
            });
            mouseCaptor.on("mousemovebody", (eventLike) => {
              if (!draggingNode || !draggedNode || !graph.hasNode(draggedNode)) return;
              const point = toViewportPoint(eventLike);
              if (!point) return;
              const graphPoint = renderer.viewportToGraph(point);
              graph.mergeNodeAttributes(draggedNode, { x: graphPoint.x, y: graphPoint.y });
              if (dragStartedAt) {
                dragMoved = Math.hypot(point.x - dragStartedAt.x, point.y - dragStartedAt.y) > 2;
              } else {
                dragMoved = true;
              }
              stopEvent(eventLike);
              renderer.refresh();
            });
            mouseCaptor.on("mouseup", endDrag);
            mouseCaptor.on("mouseleave", endDrag);
            window.addEventListener("mouseup", endDrag, { signal });
            window.addEventListener("blur", endDrag, { signal });
          }

          function setupInteractions() {
            setupDynamicControlInteractions();
            ["sigma-toggle-external", "sigma-toggle-isolated"].forEach((id) => document.getElementById(id).addEventListener("change", () => { refresh(); fitCamera(); }));
            document.querySelectorAll("[data-custom-graph-mode]").forEach((tab) => tab.addEventListener("click", () => setCustomMode(tab.dataset.customGraphMode)));
            document.getElementById("sigma-toggle-labels").addEventListener("change", () => renderer.refresh());
            document.getElementById("sigma-focus-term").addEventListener("click", focusTerm);
            document.getElementById("sigma-clear-selection").addEventListener("click", clearSelection);
            document.getElementById("sigma-reset-view").addEventListener("click", () => { clearSelection(); refresh(); fitCamera(); setStatus("View reset to fit visible graph."); });
            document.getElementById("sigma-term-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); focusTerm(); } });
            document.getElementById("sigma-term-search").addEventListener("input", () => renderer.refresh());
            window.addEventListener("ocg:graph-viewport-change", (event) => {
              if (event.detail?.panelId !== "custom-graph-panel" || !renderer) return;
              renderer.refresh();
              fitCamera(false);
            });
            setupRendererInteractions();
          }

          function setupDynamicControlInteractions() {
            document.querySelectorAll("[data-sigma-relation], [data-sigma-node-type]").forEach((input) => input.addEventListener("change", () => { refresh(); fitCamera(); }));
          }

          function setupRendererInteractions() {
            interactionAbortController?.abort();
            interactionAbortController = new AbortController();
            const { signal } = interactionAbortController;
            containerResizeObserver?.disconnect();
            window.clearTimeout(containerResizeFitTimer);
            setupDragging(signal);
            const handleGraphClick = (payload) => {
              if (payload.target?.closest?.("[data-graph-expand], [data-sigma-controls-toggle]")) return;
              if (shouldSuppressClick()) return;
              const point = toViewportPoint(payload);
              if (!point) return;
              const node = getNodeAtPoint(point);
              if (node) {
                selectNode(node);
                return;
              }
              const edge = findNearbyEdge(point);
              if (edge) {
                selectEdge(edge);
                return;
              }
              clearSelection();
            };
            container.addEventListener("click", handleGraphClick, { signal });
            container.addEventListener("pointermove", updateFallbackHover, { passive: true, signal });
            container.addEventListener("pointerleave", () => {
              clearNodeTooltip();
              if (selectedEdge) {
                updateEdgeHoverInfo(selectedEdge, null, true);
              } else {
                clearEdgeHoverInfo();
              }
            }, { signal });
            containerResizeObserver = new ResizeObserver(() => {
              renderer.refresh();
              window.clearTimeout(containerResizeFitTimer);
              containerResizeFitTimer = window.setTimeout(() => {
                renderer.refresh();
                fitCamera(false);
              }, 240);
            });
            containerResizeObserver.observe(container);
          }

          function drawReadableNodeLabel(context, data, settings) {
            if (!data.label) return;
            context.save();
            context.font = settings.labelWeight + " " + settings.labelSize + "px " + settings.labelFont;
            const textWidth = context.measureText(data.label).width;
            const viewportWidth = context.canvas.clientWidth || context.canvas.width;
            const placement = getNodeLabelPlacement(data.x, data.size, textWidth, viewportWidth);
            const x = placement.x;
            const y = data.y + settings.labelSize / 3;
            context.textAlign = placement.align;
            context.lineJoin = "round";
            context.miterLimit = 2;
            context.strokeStyle = "rgba(251, 253, 255, 0.96)";
            context.lineWidth = 3.5;
            context.strokeText(data.label, x, y);
            context.fillStyle = data.labelColor || "#253846";
            context.fillText(data.label, x, y);
            context.restore();
          }

          function buildGraph() {
            const graphology = window.graphology;
            const SigmaCtor = window.Sigma;
            if (!graphology?.Graph || !SigmaCtor) throw new Error("Graphology or Sigma failed to load.");
            graph = new graphology.Graph({ type: "directed", multi: true, allowSelfLoops: true });
            const forceAllLabels = graphData.nodes.length <= LABEL_SETTINGS.forceAllUnder;
            const priorityCount = Math.min(
              graphData.nodes.length,
              Math.max(12, Math.ceil(graphData.nodes.length * 0.18))
            );
            const priorityNodeIds = new Set(
              [...graphData.nodes]
                .sort((left, right) => (right.degree || 0) - (left.degree || 0) || left.qname.localeCompare(right.qname))
                .slice(0, priorityCount)
                .map((node) => node.id)
            );
            graphData.nodes.forEach((node) => {
              const color = TYPE_COLOR[node.termType] || TYPE_COLOR.declaredTerm;
              const size = node.isExternal ? 5.1 : Math.min(11, 6.5 + Math.sqrt((node.degree || 0) + 1));
              graph.addNode(node.id, {
                x: node.x || 0,
                y: node.y || 0,
                size,
                baseSize: size,
                label: node.qname,
                qname: node.qname,
                qnameLower: node.qname.toLowerCase(),
                labelLower: (node.label || node.qname).toLowerCase(),
                labelColor: "#253846",
                forceLabel: forceAllLabels || priorityNodeIds.has(node.id),
                baseForceLabel: forceAllLabels || priorityNodeIds.has(node.id),
                color,
                baseColor: color,
                termType: node.termType,
                isExternal: node.isExternal
              });
            });
            graphData.edges.forEach((edge, index) => {
              const color = TYPE_COLOR[edge.relation] || "#6f8394";
              const id = edge.id || "rel-" + String(index + 1).padStart(3, "0");
              graph.addDirectedEdgeWithKey(id, edge.source, edge.target, { type: "arrow", color, baseColor: color, size: EDGE_BASE_SIZE, baseSize: EDGE_BASE_SIZE, relation: edge.relation, label: edge.label || edge.relation });
            });
            renderer = new SigmaCtor(graph, container, {
              defaultEdgeType: "arrow",
              renderEdgeLabels: false,
              renderLabels: true,
              labelDensity: LABEL_SETTINGS.density,
              labelGridCellSize: LABEL_SETTINGS.gridCellSize,
              labelRenderedSizeThreshold: LABEL_SETTINGS.renderedSizeThreshold,
              labelFont: LABEL_FONT,
              labelSize: 13,
              labelWeight: "500",
              labelColor: { attribute: "labelColor", color: "#253846" },
              labelRenderer: drawReadableNodeLabel,
              stagePadding: 72,
              minCameraRatio: 0.04,
              maxCameraRatio: 18,
              hideEdgesOnMove: false,
              hoverRenderer: () => {},
              enableEdgeHoverEvents: false,
              enableEdgeClickEvents: false
            });
            setupReducers();
            recomputeVisibility();
          }

          async function main() {
            try {
              const responses = await Promise.all([fetch("assets/ontology_graph_data.json", { cache: "no-store" }), fetch("assets/ontology_relationships_overview.json", { cache: "no-store" })]);
              if (!responses[0].ok) throw new Error("Unable to load graph JSON (HTTP " + responses[0].status + ").");
              graphPayload = await responses[0].json();
              overviewData = responses[1].ok ? await responses[1].json() : { summary: {} };
              setCustomMode(DEFAULT_CUSTOM_MODE, true);
              setupInteractions();
              fitCamera(false);
              renderer.refresh();
              setStatus("Graph loaded in " + (CUSTOM_MODE_LABEL[activeCustomMode] || activeCustomMode) + " mode.");
            } catch (error) {
              console.error(error);
              statsEl.innerHTML = "<div>Failed to initialize graph.</div><div>" + escapeHtml(error.message) + "</div>";
              overviewEl.innerHTML = "<div>Overview unavailable.</div>";
            }
          }

          main();
        })();
      </script>
    `;
}

function buildTermsIndexPage(context, declaredNodes) {
  const { config } = context;
  const rows = declaredNodes
    .map(
      (node) => `
        <tr>
          <td><a href="${encodeURIComponent(node.localName)}.html"><code>${escapeHtml(node.qname)}</code></a></td>
          <td>${escapeHtml(TERM_TYPE_INFO[node.termType].label)}</td>
          <td>${escapeHtml(node.label)}</td>
          <td>${escapeHtml(node.comment || "-")}</td>
        </tr>
      `
    )
    .join("");

  return renderPage({
    config,
    title: `${config.project.title} Terms`,
    description: `Per-term pages for ${config.project.title}.`,
    currentNav: "terms",
    pathPrefix: "../",
    content: `
      <section id="terms-index" class="section">
        <div class="section-head">
          <div class="section-heading-row">
            <h1>Term Pages</h1>
            ${howToLink(config, "terms", "../")}
          </div>
          <p class="section-note">Every declared ontology term gets its own generated HTML page when <code>features.termPages</code> is enabled.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Type</th>
                <th>Label</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `
  });
}

function buildTermPage(context, node) {
  const { config, ontologyInfo, assets } = context;
  const outgoing = ontologyInfo.edges.filter((edge) => edge.source === node.id);
  const incoming = ontologyInfo.edges.filter((edge) => edge.target === node.id);
  const relatedRows = (edges, direction) =>
    edges.length
      ? edges
          .map((edge) => {
            const targetId = direction === "outgoing" ? edge.target : edge.source;
            const related = ontologyInfo.nodes.find((entry) => entry.id === targetId);
            const href = related.isExternal
              ? null
              : `${encodeURIComponent(related.localName || sanitizeFileName(related.qname))}.html`;
            return `
              <tr>
                <td>${escapeHtml(RELATION_INFO[edge.relation] || edge.relation)}</td>
                <td>
                  ${
                    href
                      ? `<a href="${href}"><code>${escapeHtml(related.qname)}</code></a>`
                      : `<code>${escapeHtml(related.qname)}</code>`
                  }
                </td>
                <td>${escapeHtml(related.comment || related.label)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="3">No ${direction} relationships generated for this term.</td></tr>`;

  const typeList = node.types.length ? node.types.map((type) => `<code>${escapeHtml(type)}</code>`).join(", ") : "<code>none</code>";
  const ontologyAsset = getAsset(assets, "ontology");
  const shapesAsset = getAsset(assets, "shapes");

  return renderPage({
    config,
    title: `${node.qname} · ${config.project.shortName}`,
    description: node.comment || node.label,
    currentNav: "terms",
    pathPrefix: "../",
    pageToc: [
      { id: "term-overview", label: node.qname },
      { id: "outgoing-relationships", label: "Outgoing Relationships" },
      { id: "incoming-relationships", label: "Incoming Relationships" }
    ],
    content: `
      <section id="term-overview" class="section">
        <div class="section-head">
          <div class="eyebrow">${escapeHtml(TERM_TYPE_INFO[node.termType].badge)}</div>
          <div class="section-heading-row">
            <h1>${escapeHtml(node.qname)}</h1>
            ${howToLink(config, "terms", "../")}
          </div>
          <p class="section-note">${escapeHtml(node.comment || node.label)}</p>
        </div>
        <dl class="meta-grid">
          <div>
            <dt>IRI</dt>
            <dd><code>${escapeHtml(node.uri)}</code></dd>
          </div>
          <div>
            <dt>Label</dt>
            <dd>${escapeHtml(node.label)}</dd>
          </div>
          <div>
            <dt>Declared Types</dt>
            <dd>${typeList}</dd>
          </div>
          <div>
            <dt>Primary Source</dt>
            <dd><a href="../${ontologyAsset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(ontologyAsset.destName)}</a></dd>
          </div>
          ${
            shapesAsset
              ? `
                <div>
                  <dt>SHACL</dt>
                  <dd><a href="../${shapesAsset.publicPath}" target="_blank" rel="noreferrer">${escapeHtml(shapesAsset.destName)}</a></dd>
                </div>
              `
              : ""
          }
        </dl>
      </section>

      <section id="outgoing-relationships" class="section">
        <div class="section-head">
          <h2>Outgoing Relationships</h2>
          <p class="section-note">Edges emitted from this term while building the graph and reference views.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Relation</th>
                <th>Target</th>
                <th>Target Description</th>
              </tr>
            </thead>
            <tbody>${relatedRows(outgoing, "outgoing")}</tbody>
          </table>
        </div>
      </section>

      <section id="incoming-relationships" class="section">
        <div class="section-head">
          <h2>Incoming Relationships</h2>
          <p class="section-note">Terms that point at this term in the generated relationship graph.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Relation</th>
                <th>Source</th>
                <th>Source Description</th>
              </tr>
            </thead>
            <tbody>${relatedRows(incoming, "incoming")}</tbody>
          </table>
        </div>
      </section>
    `
  });
}

function buildPageToc(config, items = []) {
  const tocItems = items.filter((item) => item?.id && item?.label);
  if (!config.site.toc.enabled || tocItems.length < 2) {
    return "";
  }

  const title = escapeHtml(config.site.toc.title);
  return `
    <aside class="page-toc" aria-label="${title}">
      <details open>
        <summary>
          <span>${title}</span>
          <span class="page-toc-chevron" aria-hidden="true"></span>
        </summary>
        <nav aria-label="${title}">
          <ol>
            ${tocItems
              .map(
                (item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.label)}</a></li>`
              )
              .join("")}
          </ol>
        </nav>
      </details>
    </aside>`;
}

function renderPage({ config, title, description, currentNav, content, bodyClass = "", pathPrefix = "", pageToc = [] }) {
  const nav = buildNav(config, currentNav, pathPrefix);
  const pageTocMarkup = buildPageToc(config, pageToc);
  const pageBodyClass = [bodyClass, pageTocMarkup ? "page-has-toc" : ""].filter(Boolean).join(" ");
  const mainContent = pageTocMarkup
    ? `<div class="page-content-layout">${pageTocMarkup}<div class="page-content">${content}</div></div>`
    : content;
  const customFooter = [config.site.footer.primary, config.site.footer.secondary]
    .filter(Boolean)
    .map((copy) => `<div>${escapeHtml(copy)}</div>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="icon" href="${pathPrefix}favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="512x512" href="${pathPrefix}favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${encodeFontQuery(config.theme.fonts.heading)}:wght@500;600;700&family=${encodeFontQuery(config.theme.fonts.body)}:wght@300;400;500;600&family=${encodeFontQuery(config.theme.fonts.mono)}:wght@400;500&display=swap" rel="stylesheet" />
  <style>${sharedCss(config)}</style>
</head>
<body class="${escapeHtml(pageBodyClass)}">
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="${pathPrefix}index.html">
        <span class="brand-mark">${escapeHtml(config.project.shortName)}</span>
        <span class="brand-copy">
          <strong>${escapeHtml(config.project.title)}</strong>
          <span>${escapeHtml(config.project.namespace)}</span>
        </span>
      </a>
      <nav class="site-nav">${nav}</nav>
    </header>
    <main>${mainContent}</main>
    ${customFooter ? `<footer class="site-footer">${customFooter}</footer>` : ""}
    <footer class="site-footer-generator">
      ${generatorAttribution(config, pathPrefix)}
    </footer>
  </div>
</body>
</html>`;
}

function generatorAttribution(config, pathPrefix = "") {
  const generatorRepository = config.site.generator.repositoryUrl
    ? `<a class="ocg-footer-repository" href="${escapeHtml(config.site.generator.repositoryUrl)}" target="_blank" rel="noreferrer"><img class="ocg-footer-icon" src="${pathPrefix}ocg-favicon.png" alt="" width="18" height="18" aria-hidden="true" /><span>OCG repository</span></a>`
    : "";
  const generatorDocumentation = config.site.generator.documentationUrl
    ? `<a href="${escapeHtml(config.site.generator.documentationUrl)}" target="_blank" rel="noreferrer">Documentation</a>`
    : "";
  return [
    `<span>Generated with <strong>OCG</strong> v${escapeHtml(OCG_VERSION)}</span>`,
    generatorRepository,
    generatorDocumentation
  ]
    .filter(Boolean)
    .join(`<span class="site-footer-separator" aria-hidden="true">|</span>`);
}

function buildNav(config, currentNav, pathPrefix) {
  const items = [
    { key: "home", href: `${pathPrefix}index.html`, label: "Home" },
    config.features.referencePage ? { key: "reference", href: `${pathPrefix}ontology-reference.html`, label: "Reference" } : null,
    config.features.termPages ? { key: "terms", href: `${pathPrefix}terms/index.html`, label: "Terms" } : null,
    config.features.graphPage ? { key: "graph", href: `${pathPrefix}ontology-graph.html`, label: "Graph" } : null,
    config.features.specPage && config.sources.spec
      ? { key: "spec", href: `${pathPrefix}spec/index.html`, label: "Specification" }
      : null,
    config.features.usageGuidePage
      ? { key: "guide", href: `${pathPrefix}usage-guide.html`, label: "Usage Guide" }
      : null,
  ].filter(Boolean);

  return items
    .map((item) => {
      const classes = ["nav-link", `nav-link--${item.key}`];
      if (item.key === currentNav) classes.push("is-active");
      return `<a class="${classes.join(" ")}" href="${item.href}">${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

function howToLink(config, anchor, pathPrefix = "") {
  return config.features.usageGuidePage
    ? `<a class="how-to-link" href="${pathPrefix}usage-guide.html#${anchor}">How To</a>`
    : "";
}

function sharedCss(config) {
  const colors = config.theme.colors;
  const fonts = config.theme.fonts;
  return `
    :root {
      --bg: ${colors.pageBackground};
      --bg-alt: ${colors.pageBackgroundAlt};
      --panel: ${colors.panelBackground};
      --card: ${colors.cardBackground};
      --ink: ${colors.text};
      --muted: ${colors.mutedText};
      --accent: ${colors.accent};
      --accent-strong: ${colors.accentStrong};
      --border: ${colors.border};
      --heading-font: "${fonts.heading}", sans-serif;
      --body-font: "${fonts.body}", sans-serif;
      --mono-font: "${fonts.mono}", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: var(--body-font);
      background:
        radial-gradient(circle at top right, rgba(31, 111, 120, 0.18), transparent 43%),
        radial-gradient(circle at bottom left, rgba(225, 171, 78, 0.16), transparent 40%),
        linear-gradient(120deg, var(--bg) 0%, var(--bg-alt) 65%, #f8f2e6 100%);
      min-height: 100vh;
    }
    body::before {
      content: "";
      position: fixed;
      width: 420px;
      height: 420px;
      top: -140px;
      right: -120px;
      background: radial-gradient(circle at top, rgba(31, 111, 120, 0.18), transparent 70%);
      z-index: -1;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: var(--mono-font); }
    .page-shell {
      width: min(1120px, 92vw);
      margin: 0 auto;
      padding: 48px 0 80px;
    }
    .page-has-toc .page-shell {
      width: min(1320px, 95vw);
    }
    .page-content-layout {
      display: grid;
      grid-template-columns: minmax(180px, 214px) minmax(0, 1fr);
      align-items: start;
      gap: 22px;
    }
    .page-content {
      min-width: 0;
    }
    .page-toc {
      position: sticky;
      top: 22px;
      align-self: start;
    }
    .page-toc details {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 12px 28px rgba(16, 37, 56, 0.07);
      backdrop-filter: blur(10px);
    }
    .page-toc summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 44px;
      padding: 10px 12px;
      color: var(--ink);
      cursor: pointer;
      font-family: var(--heading-font);
      font-size: 0.86rem;
      font-weight: 700;
      list-style: none;
    }
    .page-toc summary::-webkit-details-marker {
      display: none;
    }
    .page-toc-chevron {
      position: relative;
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
      border: 1px solid #d7e0e3;
      border-radius: 6px;
      background: #f1f4f5;
    }
    .page-toc-chevron::before {
      content: "";
      position: absolute;
      top: 6px;
      left: 5px;
      width: 6px;
      height: 6px;
      border-right: 1.5px solid #5e6d75;
      border-bottom: 1.5px solid #5e6d75;
      transform: rotate(45deg);
      transition: transform 0.16s ease;
    }
    .page-toc details[open] .page-toc-chevron::before {
      top: 8px;
      transform: rotate(225deg);
    }
    .page-toc nav {
      border-top: 1px solid #e1e8ea;
      padding: 8px;
    }
    .page-toc ol {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .page-toc a {
      display: block;
      padding: 7px 8px;
      border-radius: 8px;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1.3;
      overflow-wrap: anywhere;
      transition: background-color 0.16s ease, color 0.16s ease;
    }
    .page-toc a:hover,
    .page-toc a:focus-visible {
      background: rgba(31, 111, 120, 0.09);
      color: var(--accent-strong);
      text-decoration: none;
      outline: none;
    }
    section[id] {
      scroll-margin-top: 22px;
    }
    .page-graph .page-shell {
      width: min(1450px, 95vw);
      padding: 24px 0 46px;
    }
    .site-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 34px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid var(--border);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      box-shadow: 0 18px 38px rgba(16, 37, 56, 0.11);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1 1 360px;
      max-width: 100%;
      min-width: 0;
    }
    .brand-mark {
      width: auto;
      min-width: 48px;
      max-width: min(40vw, 320px);
      height: 48px;
      display: grid;
      place-items: center;
      padding: 0 10px;
      border-radius: 14px;
      background: linear-gradient(140deg, #248992 0%, var(--accent) 100%);
      color: #ffffff;
      font-family: var(--heading-font);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.1;
      overflow-wrap: anywhere;
      text-align: center;
      flex: 0 0 auto;
    }
    .brand-copy {
      display: grid;
      flex: 1 1 auto;
      gap: 3px;
      min-width: 0;
    }
    .brand-copy strong,
    .brand-copy span {
      display: block;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .brand-copy strong {
      font-family: var(--heading-font);
      font-size: 1rem;
    }
    .brand-copy span {
      color: var(--muted);
      font-size: 0.86rem;
    }
    .site-nav {
      display: flex;
      flex: 0 1 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
    }
    .nav-link {
      padding: 8px 11px;
      border-radius: 999px;
      font-weight: 600;
      color: #294456;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    .nav-link:hover,
    .nav-link.is-active {
      color: var(--accent-strong);
      background: rgba(31, 111, 120, 0.12);
    }
    .nav-link--guide,
    .nav-link--how-to {
      color: #687681;
      background: #f0f2f3;
      border: 1px solid #d7dde1;
    }
    .nav-link--guide:hover,
    .nav-link--how-to:hover,
    .nav-link--guide.is-active {
      color: #45525c;
      background: #e4e8ea;
      border-color: #c4ccd1;
      text-decoration: none;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.95fr);
      gap: 18px;
      margin-bottom: 26px;
    }
    .hero-copy,
    .hero-panel,
    .section,
    .graph-shell,
    .viewer {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(250, 252, 253, 0.96) 100%);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: 0 18px 38px rgba(16, 37, 56, 0.11);
    }
    .hero-copy {
      padding: 28px;
    }
    .hero-panel {
      padding: 22px;
      display: grid;
      align-content: start;
      gap: 14px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(31, 111, 120, 0.12);
      color: var(--accent-strong);
      font-size: 0.84rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0;
      font-family: var(--heading-font);
      letter-spacing: -0.02em;
    }
    h1 {
      font-size: clamp(2.3rem, 4vw, 3.5rem);
      margin-bottom: 14px;
    }
    h2 {
      font-size: clamp(1.45rem, 2.2vw, 2rem);
    }
    h3 {
      font-size: 1.08rem;
      margin-bottom: 9px;
    }
    p {
      margin: 0;
      line-height: 1.65;
      color: var(--muted);
    }
    .hero-actions,
    .site-footer,
    .graph-controls,
    .tabs,
    .viewer-head {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .page-home .site-header {
      margin-bottom: 24px;
      padding: 12px 14px;
    }
    .page-home .brand {
      gap: 11px;
    }
    .page-home .brand-mark {
      min-width: 42px;
      height: 42px;
      padding: 0 9px;
      border-radius: 12px;
      font-size: 0.9rem;
    }
    .page-home .brand-copy strong {
      font-size: 0.92rem;
    }
    .page-home .brand-copy span {
      font-size: 0.76rem;
    }
    .page-home .site-nav {
      gap: 6px;
    }
    .page-home .nav-link {
      padding: 7px 10px;
      font-size: 0.88rem;
    }
    .page-home .hero {
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
      gap: 14px;
      margin-bottom: 18px;
    }
    .page-home .hero-copy {
      padding: 24px;
    }
    .page-home .hero-panel {
      padding: 18px;
      gap: 10px;
    }
    .page-home h1 {
      font-size: clamp(1.95rem, 3.2vw, 2.85rem);
      line-height: 1.08;
      margin-bottom: 10px;
    }
    .page-home .hero-copy > p {
      max-width: 62ch;
      font-size: 0.98rem;
      line-height: 1.52;
    }
    .page-home .hero-panel h2 {
      font-size: 1.45rem;
    }
    .page-home .hero-panel > p {
      font-size: 0.9rem;
      line-height: 1.48;
    }
    .page-home .hero-actions {
      display: grid;
      gap: 9px;
      margin-top: 18px;
      align-items: stretch;
    }
    .page-home .hero-action-group {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
    }
    .page-home .hero-action-group--artifacts {
      display: grid;
      grid-template-columns: repeat(var(--artifact-count, 1), minmax(0, 1fr));
      padding-top: 9px;
      border-top: 1px solid var(--border);
    }
    .page-home .hero-action-group--artifacts .btn {
      width: 100%;
    }
    .page-home .hero-actions .btn {
      min-height: 34px;
      padding: 8px 11px;
      border-radius: 10px;
      font-size: 0.82rem;
    }
    .page-home .meta-grid {
      gap: 8px;
    }
    .page-home .meta-grid div {
      padding: 10px;
      border-radius: 11px;
    }
    .page-home .meta-item--namespace,
    .page-home .meta-item--canonical {
      grid-column: 1 / -1;
    }
    .page-home .meta-grid dt {
      margin-bottom: 4px;
      font-size: 0.75rem;
    }
    .page-home .meta-grid dd {
      font-size: 0.86rem;
    }
    .page-home .namespace-value {
      gap: 7px;
    }
    .page-home .namespace-value code {
      font-size: 0.78rem;
    }
    .page-home .icon-button {
      width: 30px;
      height: 30px;
      padding: 6px;
      border-radius: 9px;
    }
    .page-home .icon-button svg {
      width: 16px;
      height: 16px;
    }
    .page-home main > .section {
      padding: 18px;
      margin-bottom: 18px;
    }
    .page-home main > .section .section-head {
      margin-bottom: 14px;
    }
    .page-home main > .section h2 {
      font-size: 1.45rem;
    }
    .page-home main > .section .section-note {
      font-size: 0.9rem;
    }
    .page-home .metrics-grid {
      grid-template-columns: repeat(var(--metric-count, 1), minmax(0, 1fr));
      gap: 10px;
    }
    .page-home .section--overview .section-note {
      max-width: none;
    }
    .page-home .section--overview .card {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      min-width: 0;
    }
    .page-home .section--overview .card h3,
    .page-home .section--overview .card p,
    .page-home .section--overview .card-link {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .page-home .section--overview .card-link {
      margin-top: auto;
      padding-top: 12px;
    }
    .page-home .metric-card {
      padding: 13px;
      border-radius: 12px;
      gap: 6px;
    }
    .page-home .metric-number {
      font-size: 1.6rem;
      line-height: 1;
      margin-bottom: 0;
    }
    .page-home .metric-label {
      font-size: 0.8rem;
      line-height: 1.25;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      padding: 11px 16px;
      border-radius: 12px;
      border: 1px solid transparent;
      font-size: 0.94rem;
      font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
    }
    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 24px rgba(19, 55, 70, 0.18);
    }
    .btn:focus-visible {
      outline: 3px solid rgba(31, 111, 120, 0.25);
      outline-offset: 2px;
    }
    .btn--primary {
      background: linear-gradient(140deg, #248992 0%, var(--accent) 100%);
      border-color: #1c7d86;
      color: #ffffff;
      box-shadow: 0 8px 18px rgba(31, 111, 120, 0.24);
    }
    .btn--ghost {
      border-color: #c7d3de;
      background: rgba(255, 255, 255, 0.92);
      color: var(--accent-strong);
    }
    .btn--ghost:hover {
      border-color: #9ab0c3;
      background: #ffffff;
    }
    .btn--small {
      min-height: 36px;
      padding: 8px 12px;
      font-size: 0.88rem;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 0;
    }
    .meta-grid div {
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: var(--card);
    }
    .meta-grid dt {
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 0.85rem;
      font-weight: 600;
    }
    .meta-grid dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .namespace-value {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .namespace-value code {
      min-width: 0;
      overflow-x: auto;
      white-space: nowrap;
    }
    .icon-button {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 7px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #ffffff;
      color: var(--accent-strong);
      cursor: pointer;
      transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }
    .icon-button:hover,
    .icon-button:focus-visible {
      transform: translateY(-1px);
      border-color: var(--accent);
      background: rgba(14, 123, 129, 0.08);
      outline: none;
    }
    .icon-button[data-copied="true"] {
      background: rgba(14, 123, 129, 0.14);
      border-color: var(--accent);
    }
    .icon-button svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }
    .section {
      padding: 22px;
      margin-bottom: 24px;
    }
    .section-head {
      display: grid;
      gap: 8px;
      margin-bottom: 18px;
    }
    .section-note {
      max-width: 78ch;
    }
    .reference-hierarchy {
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(239, 247, 248, 0.94)),
        var(--panel);
    }
    .hierarchy-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -4px 0 16px;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .hierarchy-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
      gap: 18px;
      align-items: start;
    }
    .hierarchy-tree,
    .hierarchy-links {
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.82);
    }
    .hierarchy-tree > ul,
    .hierarchy-tree ul {
      display: grid;
      gap: 7px;
      margin: 0;
      padding-left: 18px;
      list-style: none;
    }
    .hierarchy-tree > ul {
      padding-left: 0;
    }
    .hierarchy-item {
      min-width: 0;
    }
    .hierarchy-item details {
      border-left: 2px solid #d8e5e7;
      padding-left: 12px;
    }
    .hierarchy-item summary,
    .hierarchy-item--leaf {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 35px;
      padding: 7px 9px;
      border: 1px solid #e0e8e9;
      border-radius: 9px;
      background: #fbfdfd;
      color: var(--ink);
      cursor: pointer;
      list-style: none;
    }
    .hierarchy-item summary::-webkit-details-marker {
      display: none;
    }
    .hierarchy-item summary::before {
      content: ">";
      flex: 0 0 auto;
      color: var(--accent);
      font-family: var(--mono-font);
      font-weight: 700;
      transform: rotate(0deg);
      transition: transform 0.16s ease;
    }
    .hierarchy-item details[open] > summary::before {
      transform: rotate(90deg);
    }
    .hierarchy-item summary:hover,
    .hierarchy-item summary:focus-visible,
    .hierarchy-item--leaf:hover {
      border-color: #b9d1d4;
      background: #f1f8f8;
      outline: none;
    }
    .hierarchy-item summary .hierarchy-term,
    .hierarchy-item--leaf .hierarchy-term {
      flex: 1 1 auto;
      min-width: 0;
    }
    .hierarchy-term {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 7px;
      color: var(--ink);
      overflow-wrap: anywhere;
    }
    .hierarchy-term:hover {
      color: var(--accent-strong);
      text-decoration: none;
    }
    .hierarchy-term code {
      color: var(--muted);
      font-size: 0.78rem;
    }
    .hierarchy-child-count {
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      min-width: 22px;
      height: 22px;
      padding: 0 5px;
      border-radius: 999px;
      background: #e8f1f2;
      color: #4e6d72;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .hierarchy-links h3 {
      margin: 0 0 10px;
      font-size: 1.02rem;
    }
    .hierarchy-links ul {
      display: grid;
      gap: 10px;
      margin: 0;
      padding-left: 17px;
      color: var(--muted);
    }
    .hierarchy-links li {
      line-height: 1.5;
    }
    .hierarchy-empty {
      padding: 14px 16px;
      border: 1px dashed #b9cdd0;
      border-radius: 12px;
      background: rgba(241, 248, 248, 0.72);
      color: var(--muted);
      line-height: 1.55;
    }
    .hierarchy-links .hierarchy-term {
      display: inline;
    }
    .hierarchy-relation {
      display: inline-block;
      margin: 0 3px;
      color: var(--accent-strong);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .card-grid,
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .guide-hero {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: stretch;
      gap: 28px;
      padding: 30px;
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(239, 247, 248, 0.96)),
        var(--panel);
    }
    .guide-hero > .guide-toc {
      width: fit-content;
      max-width: min(100%, 360px);
      margin: 0;
      align-self: stretch;
    }
    .guide-hero-copy {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      min-width: 0;
      padding: 8px 0;
    }
    .guide-hero > .guide-toc:not([open]) {
      width: fit-content;
      align-self: start;
    }
    .guide-hero h1 {
      max-width: 780px;
      margin-bottom: 12px;
      font-size: clamp(2rem, 3.5vw, 3rem);
    }
    .guide-hero-copy > p {
      max-width: 78ch;
    }
    .guide-toc {
      width: fit-content;
      max-width: 100%;
      margin-right: auto;
      margin-left: auto;
      padding: 0;
      overflow: hidden;
      background: linear-gradient(180deg, #ffffff 0%, #f9fbfb 100%);
      border: 1px solid #d8e0e3;
      border-radius: 16px;
      box-shadow: 0 12px 28px rgba(16, 37, 56, 0.08);
      scroll-margin-top: 28px;
    }
    .guide-toc-summary,
    .guide-toc-nav {
      width: 100%;
    }
    .guide-toc-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 66px;
      padding: 14px 20px;
      cursor: pointer;
      list-style: none;
    }
    .guide-toc-summary::-webkit-details-marker {
      display: none;
    }
    .guide-toc-heading {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .guide-toc-heading h2 {
      color: var(--ink);
      font-size: 1.18rem;
      letter-spacing: -0.015em;
    }
    .guide-toc[open] .guide-toc-summary {
      border-bottom: 1px solid #e2e8ea;
    }
    .guide-toc-toggle {
      position: relative;
      flex: 0 0 28px;
      width: 28px;
      height: 28px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #f0f2f3;
    }
    .guide-toc-toggle::before,
    .guide-toc-toggle::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 11px;
      height: 1px;
      background: #687681;
      transform: translate(-50%, -50%);
    }
    .guide-toc-toggle::after {
      transform: translate(-50%, -50%) rotate(90deg);
      transition: transform 0.18s ease;
    }
    .guide-toc[open] .guide-toc-toggle::after {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    .guide-toc-summary:hover .guide-toc-toggle {
      border-color: #bdc7cc;
      background: #e4e8ea;
    }
    .guide-toc-nav {
      padding: 18px 20px 22px;
    }
    .guide-toc-list {
      display: grid;
      gap: 3px;
      margin: 0;
      padding: 2px 0 2px 14px;
      border-left: 2px solid #e2e9eb;
      list-style: none;
    }
    .guide-toc-item--level-1 {
      margin-left: 30px;
    }
    .guide-toc-link {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 32px;
      padding: 5px 9px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--muted);
      font-size: 0.86rem;
      font-weight: 600;
      transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
    }
    .guide-toc-item--level-0 .guide-toc-link {
      border-color: #e5ebed;
      background: rgba(241, 245, 246, 0.72);
      color: var(--ink);
      font-weight: 700;
    }
    .guide-toc-item--level-1 .guide-toc-link {
      min-height: 29px;
      padding-left: 12px;
      font-size: 0.82rem;
      font-weight: 500;
    }
    .guide-toc-marker {
      display: inline-grid;
      flex: 0 0 26px;
      place-items: center;
      width: 26px;
      height: 22px;
      border: 1px solid #d7e1e4;
      border-radius: 6px;
      background: #edf3f4;
      color: #52646c;
      font-family: var(--mono-font);
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .guide-toc-item--level-1 .guide-toc-marker {
      flex-basis: 7px;
      width: 7px;
      height: 7px;
      border: 1px solid #aeb9bf;
      border-radius: 50%;
      background: transparent;
      font-size: 0;
    }
    .guide-toc-link:hover {
      border-color: var(--border);
      background: #f0f2f3;
      color: var(--accent-strong);
      text-decoration: none;
    }
    .guide-toc-item--level-0 .guide-toc-link:hover {
      border-color: #cbd8dc;
      background: #eef3f4;
    }
    .guide-quick-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
    }
    .guide-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
    }
    .guide-card {
      display: grid;
      align-content: start;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--card);
    }
    .guide-card .term-badge {
      width: fit-content;
      margin: 0 0 2px;
    }
    .guide-card h3 {
      margin-bottom: 0;
    }
    .guide-card p {
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .guide-card h3 a {
      color: var(--ink);
    }
    .guide-card h3 a:hover {
      color: var(--accent-strong);
      text-decoration: none;
    }
    .guide-component {
      scroll-margin-top: 28px;
    }
    .guide-component .section-head {
      align-items: end;
    }
    .guide-component .section-head > div {
      min-width: 0;
    }
    .guide-component .section-head .term-badge {
      margin-bottom: 8px;
    }
    .guide-component h3 {
      margin-top: 22px;
      margin-bottom: 8px;
    }
    .guide-example-note {
      margin-bottom: 12px;
      color: var(--muted);
    }
    .guide-options-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--card);
    }
    .guide-options {
      width: 100%;
      min-width: 680px;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .guide-options th,
    .guide-options td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    .guide-options thead th {
      color: var(--ink);
      background: rgba(237, 243, 247, 0.72);
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .guide-options tbody tr:last-child th,
    .guide-options tbody tr:last-child td {
      border-bottom: 0;
    }
    .guide-options tbody th {
      width: 38%;
      color: var(--accent-strong);
      font-weight: 600;
    }
    .guide-options tbody td {
      color: var(--muted);
      line-height: 1.5;
    }
    .guide-steps {
      display: grid;
      gap: 12px;
      margin: 0;
      padding-left: 24px;
      color: var(--muted);
      line-height: 1.6;
    }
    .guide-steps strong {
      color: var(--ink);
    }
    .guide-code {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: #102027;
      color: #ecf5f7;
      font-size: 0.84rem;
      line-height: 1.55;
      overflow-x: auto;
    }
    .guide-callout {
      padding: 14px 16px;
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      background: rgba(31, 111, 120, 0.08);
      color: var(--muted);
      line-height: 1.55;
    }
    .guide-callout strong {
      color: var(--ink);
    }
    .how-to-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid #d1d8dc;
      border-radius: 999px;
      background: #eef1f2;
      color: #687681;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: none;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    }
    .how-to-link:hover {
      border-color: #bdc7cc;
      background: #e4e8ea;
      color: #45525c;
      text-decoration: none;
    }
    .section-heading-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .section-heading-row h1,
    .section-heading-row h2 {
      margin-bottom: 0;
    }
    .card,
    .metric-card {
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--card);
      box-shadow: 0 18px 34px rgba(25, 39, 52, 0.08);
      display: grid;
      gap: 12px;
    }
    .card-link {
      display: inline-flex;
      margin-top: 12px;
      font-weight: 700;
      color: var(--accent-strong);
    }
    .metric-number {
      font-family: var(--heading-font);
      font-size: 2rem;
      margin-bottom: 4px;
    }
    .metric-label {
      color: var(--muted);
      font-weight: 600;
    }
    .term-badge {
      display: inline-flex;
      margin-bottom: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(14, 123, 129, 0.1);
      color: var(--accent-strong);
      font-size: 0.8rem;
      font-weight: 700;
    }
    .featured-terms-grid {
      align-items: stretch;
    }
    .featured-term-card {
      align-content: start;
      grid-template-rows: auto auto 1fr;
      min-width: 0;
      overflow: hidden;
    }
    .featured-term-card .term-badge {
      align-items: center;
      justify-content: center;
      min-height: 30px;
      margin-bottom: 0;
      box-sizing: border-box;
      line-height: 1.2;
    }
    .featured-term-card h3,
    .featured-term-card p {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .featured-term-card h3 {
      line-height: 1.28;
    }
    .featured-term-card h3 a {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .table-wrap {
      overflow-x: auto;
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      background: #ffffff;
    }
    th, td {
      text-align: left;
      vertical-align: top;
      padding: 10px 12px;
      font-size: 0.9rem;
      line-height: 1.45;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: #234;
      font-size: 0.88rem;
      background: #edf5f8;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:nth-child(even) td { background: #fbfdff; }
    tr:last-child td {
      border-bottom: none;
    }
    .viewer {
      padding: 18px;
    }
    .tabs {
      margin-bottom: 14px;
    }
    .tab {
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: #ffffff;
      color: var(--muted);
      font-weight: 700;
      cursor: pointer;
    }
    .tab.active {
      background: rgba(14, 123, 129, 0.12);
      color: var(--accent-strong);
      border-color: rgba(14, 123, 129, 0.3);
    }
    .viewer-head {
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .viewer-note {
      color: var(--muted);
      margin-top: 4px;
    }
    .viewer-pane {
      margin: 0;
      min-height: 340px;
      padding: 18px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: #102027;
      color: #ecf5f7;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .graph-controls {
      margin-bottom: 16px;
      justify-content: space-between;
    }
    .graph-view-tabs,
    .graph-mode-tabs {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 18px;
      padding: 5px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #f3f6f7;
      overflow: hidden;
      isolation: isolate;
    }
    .graph-view-tab,
    .graph-mode-tab {
      padding: 9px 14px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .graph-view-tab:hover,
    .graph-view-tab:focus-visible,
    .graph-mode-tab:hover,
    .graph-mode-tab:focus-visible {
      color: var(--accent-strong);
      outline: 2px solid rgba(14, 123, 129, 0.25);
      outline-offset: 1px;
    }
    .graph-view-tab.active,
    .graph-mode-tab.active {
      background: var(--accent-strong);
      color: #ffffff;
    }
    .graph-view-panel[hidden] {
      display: none;
    }
    .graph-expand-btn {
      min-height: 36px;
      padding: 8px 13px;
      border: 1px solid #c6d2d8;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.96);
      color: #345664;
      font: inherit;
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .graph-expand-btn--icon {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 25;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      min-height: 0;
      padding: 7px;
      border-radius: 9px;
      box-shadow: 0 5px 12px rgba(16, 37, 56, 0.12);
    }
    .graph-expand-btn--icon svg {
      display: block;
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }
    .graph-expand-btn--icon svg[hidden] {
      display: none;
    }
    .sigma-controls-toggle {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 25;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 36px;
      padding: 7px 10px;
      border: 1px solid #c6d2d8;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.96);
      color: #345664;
      box-shadow: 0 5px 12px rgba(16, 37, 56, 0.12);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
    }
    .sigma-controls-toggle svg {
      width: 19px;
      height: 19px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-width: 1.7;
    }
    .sigma-controls-toggle:hover,
    .sigma-controls-toggle:focus-visible {
      border-color: var(--accent);
      background: #eff8fa;
      color: var(--accent-strong);
      outline: 2px solid rgba(14, 123, 129, 0.2);
      outline-offset: 2px;
    }
    .graph-expand-help {
      position: absolute;
      top: 54px;
      right: 10px;
      z-index: 24;
      padding: 5px 8px;
      border: 1px solid rgba(184, 200, 210, 0.78);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.94);
      color: #5b6773;
      font-size: 0.76rem;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 5px 12px rgba(16, 37, 56, 0.12);
    }
    .graph-expand-help[hidden] {
      display: none;
    }
    .graph-expand-btn:hover,
    .graph-expand-btn:focus-visible {
      border-color: var(--accent);
      background: #eff8fa;
      color: var(--accent-strong);
      outline: 2px solid rgba(14, 123, 129, 0.2);
      outline-offset: 2px;
    }
    .graph-view-panel.graph-panel--expanded,
    .graph-view-panel:fullscreen {
      position: fixed;
      inset: 0;
      z-index: 1000;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 18px 24px 24px;
      overflow: auto;
      border: 0;
      border-radius: 0;
      background: var(--panel);
    }
    .graph-view-panel:-webkit-full-screen {
      position: fixed;
      inset: 0;
      z-index: 1000;
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 18px 24px 24px;
      overflow: auto;
      border: 0;
      border-radius: 0;
      background: var(--panel);
    }
    body.graph-fullscreen-active {
      overflow: hidden;
    }
    .sigma-graph-panel.graph-controls-collapsed .sigma-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .sigma-graph-panel.graph-controls-collapsed .sigma-panel {
      display: none;
    }
    .sigma-graph-panel.graph-panel--expanded,
    .sigma-graph-panel:fullscreen,
    .sigma-graph-panel:-webkit-full-screen {
      padding: 0;
      overflow: hidden;
      background: #f7fafb;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-layout,
    .sigma-graph-panel:fullscreen .sigma-layout,
    .sigma-graph-panel:-webkit-full-screen .sigma-layout {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-card,
    .sigma-graph-panel:fullscreen .sigma-card,
    .sigma-graph-panel:-webkit-full-screen .sigma-card {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .sigma-graph-panel.graph-panel--expanded #sigma-graph-container,
    .sigma-graph-panel:fullscreen #sigma-graph-container,
    .sigma-graph-panel:-webkit-full-screen #sigma-graph-container {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 0;
      border-radius: 0;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-panel,
    .sigma-graph-panel:fullscreen .sigma-panel,
    .sigma-graph-panel:-webkit-full-screen .sigma-panel {
      position: absolute;
      z-index: 45;
      top: 58px;
      bottom: 14px;
      left: 14px;
      display: grid;
      width: min(330px, calc(100vw - 28px));
      height: auto;
      min-height: 0;
      max-height: none;
      padding: 9px;
      gap: 7px;
      border-radius: 11px;
      box-shadow: 0 10px 24px rgba(16, 37, 56, 0.14);
      transition: transform 180ms ease, opacity 180ms ease;
    }
    .sigma-graph-panel.graph-panel--expanded.graph-controls-collapsed .sigma-panel,
    .sigma-graph-panel:fullscreen.graph-controls-collapsed .sigma-panel,
    .sigma-graph-panel:-webkit-full-screen.graph-controls-collapsed .sigma-panel {
      display: grid;
      transform: translateX(calc(-100% - 24px));
      opacity: 0;
      pointer-events: none;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-graph-top,
    .sigma-graph-panel:fullscreen .sigma-graph-top,
    .sigma-graph-panel:-webkit-full-screen .sigma-graph-top {
      position: absolute;
      z-index: 22;
      top: 10px;
      left: 156px;
      right: 58px;
      pointer-events: none;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-legend,
    .sigma-graph-panel:fullscreen .sigma-legend,
    .sigma-graph-panel:-webkit-full-screen .sigma-legend {
      width: fit-content;
      max-width: 100%;
      margin: 0 auto;
      padding: 7px 9px;
      gap: 5px 9px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 14px rgba(16, 37, 56, 0.1);
      pointer-events: auto;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-graph-hint,
    .sigma-graph-panel:fullscreen .sigma-graph-hint,
    .sigma-graph-panel:-webkit-full-screen .sigma-graph-hint {
      display: none;
    }
    .sigma-graph-panel.graph-panel--expanded .graph-mode-tabs,
    .sigma-graph-panel:fullscreen .graph-mode-tabs,
    .sigma-graph-panel:-webkit-full-screen .graph-mode-tabs {
      position: absolute;
      z-index: 50;
      bottom: 12px;
      left: 50%;
      margin: 0;
      transform: translateX(-50%);
      box-shadow: 0 6px 16px rgba(16, 37, 56, 0.13);
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-block-toggle,
    .sigma-graph-panel:fullscreen .sigma-block-toggle,
    .sigma-graph-panel:-webkit-full-screen .sigma-block-toggle {
      min-height: 36px;
      padding: 8px 9px;
      font-size: 0.86rem;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-block-body,
    .sigma-graph-panel:fullscreen .sigma-block-body,
    .sigma-graph-panel:-webkit-full-screen .sigma-block-body {
      gap: 6px;
      padding: 7px 9px 9px;
    }
    .sigma-graph-panel.graph-panel--expanded .sigma-btn,
    .sigma-graph-panel:fullscreen .sigma-btn,
    .sigma-graph-panel:-webkit-full-screen .sigma-btn {
      min-height: 32px;
      padding: 6px 9px;
      font-size: 0.78rem;
    }
    .webvowl-graph-surface {
      position: relative;
      width: 100%;
    }
    .graph-view-panel.graph-panel--expanded .webvowl-graph-surface,
    .graph-view-panel:fullscreen .webvowl-graph-surface,
    .graph-view-panel:-webkit-full-screen .webvowl-graph-surface {
      height: calc(100vh - 142px);
    }
    .graph-view-panel.graph-panel--expanded .webvowl-frame,
    .graph-view-panel:fullscreen .webvowl-frame,
    .graph-view-panel:-webkit-full-screen .webvowl-frame {
      height: 100% !important;
      min-height: 0;
    }
    .sigma-layout {
      display: grid;
      grid-template-columns: minmax(292px, 320px) minmax(0, 1fr);
      gap: 16px;
      align-items: stretch;
    }
    .sigma-panel,
    .sigma-card {
      background: #ffffff;
      border: 1px solid #dce4e8;
      border-radius: 12px;
      box-shadow: 0 7px 20px rgba(16, 37, 56, 0.065);
      padding: 12px;
    }
    .sigma-panel {
      display: grid;
      grid-auto-rows: max-content;
      gap: 8px;
      align-content: start;
      position: relative;
      min-width: 0;
      min-height: calc(80vh - 100px);
      max-height: calc(150vh - 200px);
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #bdcbd2 transparent;
      background: #f8fafb;
    }
    .sigma-panel::-webkit-scrollbar { width: 7px; }
    .sigma-panel::-webkit-scrollbar-track { background: transparent; }
    .sigma-panel::-webkit-scrollbar-thumb {
      background: #bdcbd2;
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .sigma-block {
      min-width: 0;
      border: 1px solid #dfe6e9;
      border-radius: 8px;
      background: #ffffff;
      overflow: visible;
    }
    .sigma-block-toggle {
      width: 100%;
      border: 0;
      border-bottom: 1px solid transparent;
      background: #ffffff;
      color: #1f2f3f;
      cursor: pointer;
      padding: 9px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--heading-font);
      font-size: 0.88rem;
      font-weight: 600;
      line-height: 1.2;
      min-height: 38px;
      text-align: left;
      list-style: none;
      border-radius: 7px;
    }
    .sigma-block-toggle::-webkit-details-marker { display: none; }
    .sigma-block-toggle::marker { content: ""; }
    .sigma-block-toggle:hover { background: #f4f7f8; }
    .sigma-block[open] .sigma-block-toggle {
      border-bottom-color: #e4eaed;
      background: #f7f9fa;
      border-radius: 7px 7px 0 0;
    }
    .sigma-chevron {
      font-size: 0.9rem;
      color: #4b6073;
      transition: transform 0.15s ease;
      transform: rotate(-90deg);
    }
    .sigma-block[open] .sigma-chevron { transform: rotate(0deg); }
    .sigma-block-body {
      min-width: 0;
      padding: 9px 10px 10px;
      display: grid;
      gap: 7px;
    }
    .sigma-muted,
    .sigma-status,
    .sigma-graph-hint {
      margin: 0;
      color: #5b6773;
      font-size: 0.86rem;
      line-height: 1.45;
    }
    .sigma-control-group { display: grid; gap: 6px; }
    .sigma-control-group label,
    .sigma-block-body > label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.86rem;
      color: #2c3946;
    }
    .sigma-filter-title {
      margin: 4px 0 0;
      font-size: 0.79rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #5b6b7b;
    }
    .sigma-search {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.88rem;
      padding: 8px 9px;
      font-family: inherit;
      color: var(--ink);
      background: #ffffff;
    }
    .sigma-search-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .sigma-btn {
      border: 1px solid #cfdade;
      border-radius: 7px;
      padding: 7px 9px;
      font-weight: 600;
      background: #ffffff;
      color: var(--accent);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      min-height: 33px;
      font-size: 0.8rem;
      font-family: inherit;
    }
    .sigma-btn:hover { background: #f2f8fb; }
    .sigma-btn--reset {
      grid-column: 1 / -1;
      background: #176e79;
      color: #ffffff;
      border-color: #176e79;
      box-shadow: none;
      padding: 8px 10px;
      min-height: 34px;
    }
    .sigma-detail,
    .sigma-overview {
      min-width: 0;
      font-size: 0.84rem;
      line-height: 1.4;
      color: #2d3c4c;
      display: grid;
      gap: 8px;
    }
    .sigma-detail,
    .sigma-detail * {
      min-width: 0;
    }
    .sigma-detail-heading {
      display: grid;
      gap: 5px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5ebee;
    }
    .sigma-detail-heading strong {
      color: #203642;
      font-family: var(--mono-font);
      font-size: 0.86rem;
      overflow-wrap: anywhere;
    }
    .sigma-detail-type {
      width: fit-content;
      padding: 2px 7px;
      border-radius: 999px;
      background: #edf3f5;
      color: #526571;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.035em;
      text-transform: uppercase;
    }
    .sigma-detail-label {
      color: #324a57;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .sigma-detail-description {
      margin: 0;
      color: #5a6973;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
    }
    .sigma-detail-group {
      display: grid;
      gap: 5px;
    }
    .sigma-detail-group-title {
      display: flex;
      justify-content: space-between;
      color: #4d606b;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.035em;
      text-transform: uppercase;
    }
    .sigma-detail-group ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sigma-detail-group li {
      display: grid;
      gap: 2px;
      padding: 6px 7px;
      border-radius: 6px;
      background: #f5f8f9;
      overflow-wrap: anywhere;
    }
    .sigma-relation-kind {
      color: #667781;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .sigma-detail-empty {
      color: #829099;
      font-style: italic;
    }
    .sigma-detail-metadata {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 6px 9px;
      margin: 0;
    }
    .sigma-detail-metadata dt {
      color: #73818a;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .sigma-detail-metadata dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .sigma-detail code,
    .sigma-overview code {
      font-family: var(--mono-font);
      background: rgba(31, 111, 120, 0.11);
      color: #16535d;
      border-radius: 6px;
      padding: 2px 6px;
      word-break: break-word;
    }
    .sigma-stats {
      display: grid;
      gap: 6px;
      font-size: 0.88rem;
      color: #2f4458;
    }
    .sigma-graph-card { display: grid; gap: 10px; align-content: start; }
    .sigma-graph-top { display: grid; gap: 8px; }
    .sigma-legend {
      border: 1px solid #dbe4e8;
      border-radius: 10px;
      background: #f7fafb;
      padding: 9px 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
    }
    .sigma-legend-title {
      font-family: var(--heading-font);
      font-size: 0.95rem;
      color: #1f2f3f;
      margin-right: 3px;
    }
    .sigma-legend-chip {
      display: inline-flex;
      align-items: center;
      font-size: 0.82rem;
      color: #32485a;
      white-space: nowrap;
      gap: 5px;
    }
    .sigma-swatch {
      width: 11px;
      height: 11px;
      border-radius: 3px;
      border: 1px solid #b9c6d2;
      flex: 0 0 auto;
    }
    .sigma-line {
      width: 28px;
      height: 10px;
      flex: 0 0 auto;
      display: inline-block;
      color: var(--line-color, currentColor);
    }
    .sigma-line svg { display: block; width: 100%; height: 100%; }
    #sigma-graph-container {
      width: 100%;
      min-height: 670px;
      height: calc(100vh - 190px);
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fbfdff;
      position: relative;
      overflow: hidden;
    }
    .sigma-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .sigma-tooltip {
      position: absolute;
      z-index: 20;
      pointer-events: none;
      display: none;
      max-width: 320px;
      font-size: 0.78rem;
      line-height: 1.3;
      color: #f3f8ff;
      background: rgba(17, 27, 37, 0.92);
      border: 1px solid rgba(205, 220, 234, 0.35);
      border-radius: 8px;
      padding: 6px 8px;
      box-shadow: 0 8px 20px rgba(8, 16, 22, 0.28);
    }
    .sigma-node-tooltip {
      max-width: 290px;
      background: rgba(11, 34, 45, 0.92);
      border-color: rgba(186, 220, 230, 0.38);
    }
    .sigma-tooltip.visible { display: block; }
    .graph-view-note {
      margin-bottom: 14px;
      padding: 12px 14px;
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      background: rgba(14, 123, 129, 0.07);
    }
    .webvowl-frame {
      display: block;
      width: 100%;
      min-height: 320px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: #ffffff;
    }
    .graph-shell {
      padding: 12px;
      overflow: auto;
    }
    #graph-svg {
      width: 100%;
      min-width: 900px;
      height: auto;
      background: linear-gradient(180deg, rgba(248, 251, 252, 0.96) 0%, rgba(236, 243, 245, 0.96) 100%);
      border-radius: 16px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }
    .legend-item {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 999px;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.9rem;
      text-transform: capitalize;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
    }
    .checkbox {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-weight: 600;
    }
    .search {
      min-width: 260px;
      max-width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #ffffff;
      color: var(--ink);
      font: inherit;
    }
    .plain-list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.65;
    }
    .site-footer {
      justify-content: space-between;
      padding: 16px 6px 0;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .site-footer-generator {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 16px 6px 0;
      color: var(--muted);
      font-size: 0.92rem;
      text-align: center;
    }
    .site-footer-generator a {
      font-weight: 600;
    }
    .site-footer-separator {
      color: var(--border);
      font-weight: 500;
    }
    .ocg-footer-repository {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ocg-footer-icon {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      object-fit: contain;
    }
    @media (max-width: 1040px) {
      .page-has-toc .page-shell {
        width: min(1120px, 92vw);
      }
      .page-content-layout {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .page-toc {
        position: static;
      }
    }
    @media (max-width: 860px) {
      .site-header,
      .hero,
      .guide-hero {
        grid-template-columns: 1fr;
      }
      .site-header {
        align-items: flex-start;
      }
      .site-nav {
        width: 100%;
        justify-content: flex-start;
      }
      .meta-grid {
        grid-template-columns: 1fr;
      }
      .page-shell {
        width: min(100vw - 18px, 1120px);
      }
      .page-home .hero-action-group--artifacts {
        grid-template-columns: 1fr;
      }
      .page-home .metrics-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .guide-hero > .guide-toc {
        width: 100%;
        max-width: none;
      }
      .hierarchy-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 1100px) {
      .sigma-layout { grid-template-columns: 1fr; }
      .sigma-panel { max-height: none; }
      #sigma-graph-container { min-height: 520px; height: 70vh; }
    }
    @media (max-width: 640px) {
      .graph-view-panel.graph-panel--expanded,
      .graph-view-panel:fullscreen,
      .graph-view-panel:-webkit-full-screen {
        padding: 12px;
      }
      .sigma-graph-panel.graph-panel--expanded,
      .sigma-graph-panel:fullscreen,
      .sigma-graph-panel:-webkit-full-screen {
        padding: 0;
      }
      .sigma-graph-panel.graph-panel--expanded .sigma-graph-top,
      .sigma-graph-panel:fullscreen .sigma-graph-top,
      .sigma-graph-panel:-webkit-full-screen .sigma-graph-top {
        display: none;
      }
      .sigma-graph-panel.graph-panel--expanded .sigma-controls-toggle span,
      .sigma-graph-panel:fullscreen .sigma-controls-toggle span,
      .sigma-graph-panel:-webkit-full-screen .sigma-controls-toggle span {
        display: none;
      }
    }
  `;
}

function describeRelations(node, ontologyInfo) {
  const fragments = ontologyInfo.edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => `${RELATION_INFO[edge.relation] || edge.relation}: ${edge.targetQname}`);
  return fragments.length ? fragments.join(" | ") : "No graph relationships emitted";
}

function getAsset(assets, key) {
  return assets.find((asset) => asset.key === key) || null;
}

function uriToQnameOrIri(uri, orderedPrefixes) {
  const match = findPrefixForUri(uri, orderedPrefixes);
  if (!match) {
    return `<${uri}>`;
  }
  return `${match.prefix}:${uri.slice(match.base.length)}`;
}

function findPrefixForUri(uri, orderedPrefixes) {
  let best = null;
  for (const entry of orderedPrefixes) {
    if (!uri.startsWith(entry.base)) {
      continue;
    }
    if (!best || entry.base.length > best.base.length) {
      best = entry;
    }
  }
  return best;
}

function toLocalName(uri, namespace) {
  if (!uri.startsWith(namespace)) {
    return null;
  }
  return uri.slice(namespace.length);
}

function sortTerms(left, right) {
  const typeDiff = TERM_TYPE_ORDER.indexOf(left.termType) - TERM_TYPE_ORDER.indexOf(right.termType);
  if (typeDiff !== 0) {
    return typeDiff;
  }
  return collator.compare(left.qname, right.qname);
}

function sanitizeFileName(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]+/g, "_");
}

function getOptionValue(args, option) {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : null;
}

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function getProjectOrPackageResource(projectPath, packagePath) {
  return fs.existsSync(projectPath) ? projectPath : packagePath;
}

function resolveDependencyAsset(specifier) {
  try {
    return require.resolve(specifier);
  } catch {
    throw new Error(
      `Unable to resolve the bundled graph dependency asset '${specifier}'. Run npm install before building.`
    );
  }
}

function encodeFontQuery(value) {
  return value.replaceAll(" ", "+");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
