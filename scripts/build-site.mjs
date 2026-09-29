#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
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
const HEADER_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const FAVICON_MIME_TYPES = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};
const SITE_DIR = resolveProjectPath(getOptionValue(CLI_ARGS, "--output") || "site");
const ASSETS_DIR = path.join(SITE_DIR, "assets");
const VENDOR_ASSETS_DIR = path.join(ASSETS_DIR, "vendor");
const STYLE_ASSETS_DIR = path.join(ASSETS_DIR, "css");
const STYLE_TEMPLATES_DIR = path.join(PACKAGE_ROOT, "templates", "styles");
const TERMS_DIR = path.join(SITE_DIR, "terms");
const LINKED_DATA_DIR = path.join(SITE_DIR, "linked-data");
const PERSISTENT_IRI_DIR = path.join(SITE_DIR, "persistent-iri");
const CACHE_DIR = resolveProjectPath(".ocg-cache");
const PITFALL_CACHE_PATH = path.join(CACHE_DIR, "oops-report.json");
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

const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDF_TYPE = `${RDF_NAMESPACE}type`;
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
const OWL_ONTOLOGY = "http://www.w3.org/2002/07/owl#Ontology";
const VANN_PREFERRED_NAMESPACE_PREFIX = "http://purl.org/vocab/vann/preferredNamespacePrefix";
const VANN_PREFERRED_NAMESPACE_URI = "http://purl.org/vocab/vann/preferredNamespaceUri";

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
  usageGuidePage: true,
  embeddedJsonLd: true
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
      forceAllUnder: 80,
      edgeLabels: true,
      edgeLabelSize: 11
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
const RDF_MEDIA_TYPES = Object.fromEntries(
  Object.entries(SUPPORTED_ONTOLOGY_FORMATS).map(([format, details]) => [details.contentType, format])
);
const VIEWER_ASSET_KINDS = new Set(["ontology", "shapes", "shex", "spec", "example", "artifact"]);

const OOPS_NAMESPACE = "http://oops.linkeddata.es/def#";
const OOPS_IMPORTANCE_ORDER = ["Critical", "Important", "Minor"];

const DEFAULT_PITFALL_SCANNER = {
  enabled: false,
  serviceUrl: "https://oops.linkeddata.es/rest",
  pitfalls: [],
  timeoutMs: 60000,
  failOnError: false,
  cache: true
};

const DEFAULT_PERSISTENT_IRI = {
  enabled: false,
  documentIri: "",
  siteUrl: "",
  representations: []
};

const DEFAULT_THEME = {
  fonts: {
    heading: "IBM Plex Sans",
    body: "IBM Plex Sans",
    mono: "IBM Plex Mono"
  },
  colors: {
    pageBackground: "#f7f7f8",
    pageBackgroundAlt: "#f0f2f4",
    panelBackground: "#ffffff",
    cardBackground: "#ffffff",
    text: "#1c1f23",
    mutedText: "#5d6672",
    accent: "#1f6f78",
    accentStart: "#248992",
    accentBorder: "#1f6f78",
    accentStrong: "#13535a",
    border: "#e3e5e8",
    warmAccent: "#e1ab4e"
  },
  radius: {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "10px"
  },
  components: {},
  customCss: ""
};

// Primitive CSS custom properties generated from theme.colors. accentStart and
// warmAccent drove the former gradients; they stay available to custom CSS.
const THEME_COLOR_TOKENS = {
  pageBackground: "--ocg-color-page",
  pageBackgroundAlt: "--ocg-color-page-alt",
  panelBackground: "--ocg-color-panel",
  cardBackground: "--ocg-color-card",
  text: "--ocg-color-text",
  mutedText: "--ocg-color-muted",
  accent: "--ocg-color-accent",
  accentStart: "--ocg-color-accent-start",
  accentBorder: "--ocg-color-accent-border",
  accentStrong: "--ocg-color-accent-strong",
  border: "--ocg-color-border",
  warmAccent: "--ocg-color-warm-accent"
};

// Configurable components. Each option theme.components.<component>.<option>
// overrides the CSS custom property --ocg-<component>-<option> (kebab-case) that is
// declared with its default in templates/styles/tokens.css.
const THEME_COMPONENTS = {
  header: {
    description: "Site header bar holding the brand mark and page navigation.",
    options: { background: "color", border: "color", divider: "color", radius: "length", shadow: "shadow", padding: "length" }
  },
  nav: {
    description: "Page links in the site header.",
    options: { radius: "length", text: "color", hoverBackground: "color", activeBackground: "color", activeText: "color" }
  },
  button: {
    description: "Hero, viewer, and graph buttons plus How To links and the namespace copy button. primary styles the main call to action; secondary styles every other button.",
    options: {
      radius: "length",
      height: "length",
      paddingX: "length",
      fontSize: "length",
      fontWeight: "fontWeight",
      primary: { background: "color", text: "color", border: "color", hoverBackground: "color" },
      secondary: { background: "color", text: "color", border: "color", hoverBackground: "color" }
    }
  },
  panel: {
    description: "Section containers, the home hero, and the page table of contents.",
    options: { background: "color", border: "color", radius: "length", shadow: "shadow", padding: "length" }
  },
  card: {
    description: "Overview, example, featured-term, metric, pitfall, and guide cards.",
    options: { background: "color", border: "color", radius: "length", shadow: "shadow", padding: "length" }
  },
  badge: {
    description: "Term-type labels, guide section labels, and graph selection types.",
    options: { background: "color", text: "color", border: "color", radius: "length" }
  },
  tabs: {
    description: "Artifact viewer tabs and the graph representation and mode tabs.",
    options: { background: "color", border: "color", radius: "length", text: "color", activeBackground: "color", activeText: "color" }
  },
  input: {
    description: "The graph term search field.",
    options: { background: "color", border: "color", text: "color", radius: "length", focusBorder: "color" }
  },
  table: {
    description: "Reference, term, and guide tables.",
    options: { border: "color", radius: "length", headerBackground: "color", headerText: "color", stripeBackground: "color", hoverBackground: "color" }
  },
  code: {
    description: "Artifact viewer source and guide code examples.",
    options: { background: "color", text: "color", border: "color", radius: "length" }
  },
  callout: {
    description: "Guide notes plus the graph, hierarchy, and pitfall notices.",
    options: { background: "color", border: "color", text: "color", radius: "length" }
  }
};

const THEME_OPTION_DESCRIPTIONS = {
  background: "Background color",
  text: "Text color",
  border: "Border color",
  divider: "Bottom divider color",
  radius: "Corner radius",
  shadow: "Shadow: none, sm, md, lg, or a CSS box-shadow value",
  padding: "Inner padding",
  height: "Minimum height",
  paddingX: "Horizontal padding",
  fontSize: "Font size",
  fontWeight: "Font weight",
  hoverBackground: "Background color on hover",
  activeBackground: "Background color of the active item",
  activeText: "Text color of the active item",
  focusBorder: "Border color while focused",
  headerBackground: "Header row background color",
  headerText: "Header row text color",
  stripeBackground: "Background color of alternate rows; transparent disables striping"
};

const THEME_SHADOW_KEYWORDS = new Set(["sm", "md", "lg"]);

// Stylesheet templates, bundled in this order into assets/css/ocg.css. Each group
// becomes a cascade layer, so theme.customCss rules (unlayered) always win.
const STYLESHEET_LAYERS = [
  ["tokens", ["tokens.css"]],
  ["base", ["base.css"]],
  ["layout", ["layout.css"]],
  [
    "components",
    [
      "components/header.css",
      "components/footer.css",
      "components/panel.css",
      "components/card.css",
      "components/meta.css",
      "components/button.css",
      "components/badge.css",
      "components/tabs.css",
      "components/table.css",
      "components/code.css",
      "components/callout.css",
      "components/form.css",
      "components/toc.css"
    ]
  ],
  ["pages", ["pages/home.css", "pages/reference.css", "pages/graph.css", "pages/guide.css", "pages/pitfalls.css"]]
];
// The ReSpec page keeps its own document styles and only loads the shared chrome,
// scoped to its body class so the rules outrank the W3C stylesheet.
const SPEC_STYLESHEET_FILES = ["components/header.css", "components/footer.css", "pages/spec.css"];
const SPEC_STYLE_SCOPE = "body.ocg-spec-page";

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "math",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont"
]);
const FONT_FAMILY_PATTERN = /^[A-Za-z0-9-][A-Za-z0-9 ._-]*$/;
const FONT_WEIGHTS = {
  heading: [500, 600],
  body: [400, 500, 600],
  mono: [400, 500]
};

const DEFAULT_SITE = {
  basePath: "/",
  branding: {
    headerImage: "",
    favicon: ""
  },
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
    title: "On this page",
    collapseLabel: "Collapse page contents",
    expandLabel: "Expand page contents"
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
      preferredNamespacePrefix: "Preferred Prefix",
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
  class: { label: "Class", badge: "Class" },
  objectProperty: { label: "Object Property", badge: "Object Property" },
  datatypeProperty: { label: "Datatype Property", badge: "Datatype Property" },
  annotationProperty: { label: "Annotation Property", badge: "Annotation Property" },
  concept: { label: "Concept", badge: "Concept" },
  declaredTerm: { label: "Declared Term", badge: "Declared Term" },
  external: { label: "External Reference", badge: "External" }
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

const JSON_LD_BASE_CONTEXT = {
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: RDF_NAMESPACE,
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  vann: "http://purl.org/vocab/vann/",
  xsd: "http://www.w3.org/2001/XMLSchema#"
};

// File names that the generated terms/ directory already uses for itself.
const RESERVED_TERM_PAGE_NAMES = new Set(["index"]);

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
  const ontologyInfo = await parseOntology(config, assets);
  const persistentIri = buildPersistentIriContext(config, assets, ontologyInfo);
  config._persistentIri = persistentIri;
  if (args.has("--check")) {
    console.log(
      `Configuration valid: parsed ${ontologyInfo.stats.declaredTerms} declared terms and ${ontologyInfo.edges.length} relationships${persistentIri.enabled ? "; persistent IRI deployment files are ready" : ""}${config.pitfallScanner.enabled ? "; the OOPS! pitfall scan runs on build" : ""}.`
    );
    return;
  }

  const pitfallReport = await runPitfallScan(config, assets, {
    refresh: args.has("--refresh-pitfalls"),
    skip: args.has("--skip-pitfall-scan")
  });

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  ensureDir(ASSETS_DIR);
  ensureDir(TERMS_DIR);

  const relationshipSummary = buildRelationshipSummary(ontologyInfo);
  const hierarchyTtl = buildHierarchyTtl(ontologyInfo);

  copyAssets(assets);
  copyPersistentIriRepresentations(persistentIri);
  copyBrandingAssets(config);
  copyGraphVendorAssets();
  config._stylesheets = writeStylesheets(config);
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
    relationshipSummary,
    persistentIri,
    pitfallReport
  };

  writeText(path.join(SITE_DIR, "index.html"), buildIndexPage(context));
  if (persistentIri.enabled) {
    writeText(path.join(SITE_DIR, "iri-resolver.html"), buildPersistentIriResolverPage(context));
    writePersistentIriDeploymentFiles(persistentIri);
  }
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
  if (config.pitfallScanner.enabled) {
    writeText(path.join(ASSETS_DIR, "ontology_pitfalls.json"), JSON.stringify(pitfallReport, null, 2));
    writeText(path.join(SITE_DIR, "ontology-pitfalls.html"), buildPitfallPage(context));
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
      colors: { ...DEFAULT_THEME.colors, ...(raw.theme?.colors || {}) },
      radius: { ...DEFAULT_THEME.radius, ...(raw.theme?.radius || {}) },
      components: raw.theme?.components ?? DEFAULT_THEME.components,
      customCss: raw.theme?.customCss ?? DEFAULT_THEME.customCss
    },
    site: {
      ...DEFAULT_SITE,
      ...(raw.site || {}),
      branding: { ...DEFAULT_SITE.branding, ...(raw.site?.branding || {}) },
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
    persistentIri: {
      ...DEFAULT_PERSISTENT_IRI,
      ...(raw.persistentIri || {}),
      representations: raw.persistentIri?.representations || []
    },
    pitfallScanner: {
      ...DEFAULT_PITFALL_SCANNER,
      ...(raw.pitfallScanner || {}),
      pitfalls: raw.pitfallScanner?.pitfalls || []
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
  validateBrandingConfig(config);
  validateThemeConfig(config);
  validatePersistentIriConfig(config);
  validatePitfallScannerConfig(config);

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
  for (const representation of config.persistentIri.representations || []) {
    requiredPaths.push(representation.path);
  }
  for (const value of [config.site.branding.headerImage, config.site.branding.favicon, config.theme.customCss]) {
    if (value) {
      requiredPaths.push(value);
    }
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
    if (typeof labels.edgeLabels !== "boolean") {
      throw new Error("graph.custom.labels.edgeLabels must be a boolean");
    }
    if (!Number.isInteger(labels.edgeLabelSize) || labels.edgeLabelSize < 6 || labels.edgeLabelSize > 24) {
      throw new Error("graph.custom.labels.edgeLabelSize must be an integer between 6 and 24");
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

function validatePitfallScannerConfig(config) {
  const scanner = config.pitfallScanner;
  if (!scanner.enabled) {
    return;
  }
  try {
    new URL(scanner.serviceUrl);
  } catch {
    throw new Error("pitfallScanner.serviceUrl must be a valid URL");
  }
  if (!Array.isArray(scanner.pitfalls) || scanner.pitfalls.some((code) => !/^P\d{2,3}$/.test(String(code)))) {
    throw new Error("pitfallScanner.pitfalls must be an array of OOPS! pitfall codes such as 'P04'");
  }
  if (!Number.isInteger(scanner.timeoutMs) || scanner.timeoutMs < 1000 || scanner.timeoutMs > 600000) {
    throw new Error("pitfallScanner.timeoutMs must be an integer between 1000 and 600000");
  }
  for (const option of ["failOnError", "cache"]) {
    if (typeof scanner[option] !== "boolean") {
      throw new Error(`pitfallScanner.${option} must be a boolean`);
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

function validateBrandingConfig(config) {
  const branding = config.site?.branding || {};
  for (const [option, value, allowedExtensions] of [
    ["headerImage", branding.headerImage, HEADER_IMAGE_EXTENSIONS],
    ["favicon", branding.favicon, new Set(Object.keys(FAVICON_MIME_TYPES))]
  ]) {
    if (!value) continue;
    if (typeof value !== "string") {
      throw new Error(`site.branding.${option} must be a source path string`);
    }
    const extension = path.extname(value).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error(
        `site.branding.${option} must use one of: ${Array.from(allowedExtensions).join(", ")}`
      );
    }
  }
}

function validateThemeConfig(config) {
  const { fonts, colors, radius, customCss } = config.theme;
  for (const [role, family] of Object.entries(fonts)) {
    if (!Object.hasOwn(DEFAULT_THEME.fonts, role)) {
      throw new Error(`theme.fonts.${role} is not supported; use heading, body, or mono`);
    }
    if (typeof family !== "string" || !FONT_FAMILY_PATTERN.test(family.trim())) {
      throw new Error(`theme.fonts.${role} must be a single font family name, such as "IBM Plex Sans" or system-ui`);
    }
  }
  for (const [name, value] of Object.entries(colors)) {
    safeCssValue(value, `theme.colors.${name}`);
  }
  for (const [step, value] of Object.entries(radius)) {
    if (!Object.hasOwn(DEFAULT_THEME.radius, step)) {
      throw new Error(`theme.radius.${step} is not supported; use sm, md, lg, or xl`);
    }
    normalizeThemeValue("length", value, `theme.radius.${step}`);
  }
  resolveThemeComponentTokens(config.theme.components);
  if (customCss && (typeof customCss !== "string" || path.extname(customCss).toLowerCase() !== ".css")) {
    throw new Error("theme.customCss must be a repository-relative path to a .css file");
  }
}

// Returns [custom property, value] pairs for every configured component option.
function resolveThemeComponentTokens(components) {
  if (!isPlainObject(components)) {
    throw new Error("theme.components must be an object");
  }
  const tokens = [];
  const collect = (values, options, optionPath) => {
    for (const [key, value] of Object.entries(values)) {
      const keyPath = [...optionPath, key];
      const label = `theme.components.${keyPath.join(".")}`;
      const type = options[key];
      if (!type) {
        throw new Error(`${label} is not supported; use one of: ${Object.keys(options).join(", ")}`);
      }
      if (typeof type === "object") {
        if (!isPlainObject(value)) {
          throw new Error(`${label} must be an object`);
        }
        collect(value, type, keyPath);
      } else {
        tokens.push([themeTokenName(keyPath), normalizeThemeValue(type, value, label)]);
      }
    }
  };
  for (const [component, values] of Object.entries(components)) {
    if (!Object.hasOwn(THEME_COMPONENTS, component)) {
      throw new Error(
        `theme.components.${component} is not a supported component; use one of: ${Object.keys(THEME_COMPONENTS).join(", ")}`
      );
    }
    if (!isPlainObject(values)) {
      throw new Error(`theme.components.${component} must be an object`);
    }
    collect(values, THEME_COMPONENTS[component].options, [component]);
  }
  return tokens;
}

function themeComponentOptionPaths() {
  const paths = [];
  const collect = (options, optionPath) => {
    for (const [key, type] of Object.entries(options)) {
      if (typeof type === "object") {
        collect(type, [...optionPath, key]);
      } else {
        paths.push([...optionPath, key]);
      }
    }
  };
  for (const [component, { options }] of Object.entries(THEME_COMPONENTS)) {
    collect(options, [component]);
  }
  return paths;
}

function themeTokenName(optionPath) {
  return `--ocg-${optionPath.map((part) => part.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join("-")}`;
}

function normalizeThemeValue(type, value, label) {
  if (type === "length" && typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative number of pixels or a CSS length`);
    }
    return value === 0 ? "0" : `${value}px`;
  }
  if (type === "fontWeight" && typeof value === "number") {
    if (!Number.isInteger(value) || value < 100 || value > 900) {
      throw new Error(`${label} must be a font weight between 100 and 900`);
    }
    return String(value);
  }
  const css = safeCssValue(value, label);
  return type === "shadow" && THEME_SHADOW_KEYWORDS.has(css) ? `var(--ocg-shadow-${css})` : css;
}

// Theme values are written into the generated stylesheet, so they must stay a
// single declaration value that cannot close the rule or inject another one.
function safeCssValue(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty CSS value`);
  }
  const css = value.trim();
  if (css.length > 200 || /[;{}<>\\!]|\/\*/.test(css)) {
    throw new Error(`${label} must be a single CSS value without ; { } < > \\ ! or comments`);
  }
  return css;
}

function validatePersistentIriConfig(config) {
  const persistentIri = config.persistentIri;
  if (!persistentIri || typeof persistentIri !== "object" || Array.isArray(persistentIri)) {
    throw new Error("persistentIri must be an object");
  }
  if (typeof persistentIri.enabled !== "boolean") {
    throw new Error("persistentIri.enabled must be a boolean");
  }
  if (!persistentIri.enabled) {
    return;
  }
  if (!config.features.termPages) {
    throw new Error("persistentIri.enabled requires features.termPages so browser requests can resolve to term pages");
  }

  const documentIri = parsePersistentIriUrl(persistentIri.documentIri, "persistentIri.documentIri");
  const siteUrl = parsePersistentIriUrl(persistentIri.siteUrl, "persistentIri.siteUrl");
  if (documentIri.hostname !== "w3id.org") {
    throw new Error("persistentIri.documentIri must use https://w3id.org/ so OCG can generate a w3id deployment bundle");
  }
  if (documentIri.pathname.endsWith("/")) {
    throw new Error("persistentIri.documentIri must identify a document without a trailing slash");
  }
  if (documentIri.search || documentIri.hash || siteUrl.search || siteUrl.hash) {
    throw new Error("persistentIri.documentIri and persistentIri.siteUrl must not include a query string or fragment");
  }
  const namespaceDocumentIri = config.project.namespace.slice(0, -1);
  if (config.project.namespace.endsWith("/") || namespaceDocumentIri !== documentIri.href) {
    throw new Error("persistentIri.documentIri must equal project.namespace without its trailing '#'; persistent IRI support currently requires a hash namespace");
  }
  const pathSegments = documentIri.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2 || pathSegments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error("persistentIri.documentIri must use at least two simple w3id path segments, such as https://w3id.org/project/vocab");
  }
  if (!Array.isArray(persistentIri.representations)) {
    throw new Error("persistentIri.representations must be an array");
  }
  const mediaTypes = new Set();
  const destinationNames = new Set();
  for (const representation of persistentIri.representations) {
    if (!representation || typeof representation !== "object" || Array.isArray(representation)) {
      throw new Error("Each persistentIri.representations entry must be an object");
    }
    if (!RDF_MEDIA_TYPES[representation.mediaType]) {
      throw new Error(`persistentIri.representations mediaType must be one of: ${Object.keys(RDF_MEDIA_TYPES).join(", ")}`);
    }
    if (!representation.path || typeof representation.path !== "string") {
      throw new Error("Each persistentIri.representations entry requires a source path");
    }
    if (!representation.destinationName || typeof representation.destinationName !== "string") {
      throw new Error("Each persistentIri.representations entry requires destinationName");
    }
    const format = RDF_MEDIA_TYPES[representation.mediaType];
    const extension = path.extname(representation.destinationName).toLowerCase();
    if (!SUPPORTED_ONTOLOGY_FORMATS[format].extensions.includes(extension)) {
      throw new Error(`persistentIri.representations destinationName must use a ${format} extension`);
    }
    if (path.basename(representation.destinationName) !== representation.destinationName || sanitizeFileName(representation.destinationName) !== representation.destinationName) {
      throw new Error("persistentIri.representations destinationName must be a simple filename");
    }
    if (mediaTypes.has(representation.mediaType)) {
      throw new Error(`persistentIri.representations duplicates ${representation.mediaType}`);
    }
    if (destinationNames.has(representation.destinationName)) {
      throw new Error(`persistentIri.representations duplicates destinationName '${representation.destinationName}'`);
    }
    mediaTypes.add(representation.mediaType);
    destinationNames.add(representation.destinationName);
  }
}

function parsePersistentIriUrl(value, optionName) {
  if (!value || typeof value !== "string") {
    throw new Error(`${optionName} is required when persistentIri.enabled is true`);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("not https");
    }
    return url;
  } catch {
    throw new Error(`${optionName} must be an absolute https URL`);
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

function buildPersistentIriContext(config, assets, ontologyInfo) {
  if (!config.persistentIri.enabled) {
    return { enabled: false, representations: [] };
  }

  const ontologyAsset = getAsset(assets, "ontology");
  const primaryFormat = ontologyInfo.sourceFormat;
  const primaryMediaType = SUPPORTED_ONTOLOGY_FORMATS[primaryFormat].contentType;
  const primaryExtension = SUPPORTED_ONTOLOGY_FORMATS[primaryFormat].extensions[0];
  const representations = [
    {
      mediaType: primaryMediaType,
      sourcePath: ontologyAsset.sourcePath,
      destinationName: `ontology${primaryExtension}`,
      publicPath: `linked-data/ontology${primaryExtension}`,
      primary: true
    }
  ];

  for (const representation of config.persistentIri.representations) {
    if (representation.mediaType === primaryMediaType) {
      throw new Error(`persistentIri.representations duplicates the primary ontology media type ${primaryMediaType}`);
    }
    representations.push({
      mediaType: representation.mediaType,
      sourcePath: resolveProjectPath(representation.path),
      destinationName: representation.destinationName,
      publicPath: `linked-data/${representation.destinationName}`,
      primary: false
    });
  }

  const siteUrl = new URL(config.persistentIri.siteUrl);
  if (!siteUrl.pathname.endsWith("/")) {
    siteUrl.pathname = `${siteUrl.pathname}/`;
  }
  const documentUrl = new URL(config.persistentIri.documentIri);
  const documentSegments = documentUrl.pathname.split("/").filter(Boolean);
  const w3idDirectorySegments = documentSegments.slice(0, -1);
  const documentName = documentSegments.at(-1);

  for (const representation of representations) {
    representation.url = new URL(representation.publicPath, siteUrl).href;
  }

  return {
    enabled: true,
    documentIri: documentUrl.href,
    siteUrl: siteUrl.href,
    resolverPath: "iri-resolver.html",
    resolverUrl: new URL("iri-resolver.html", siteUrl).href,
    referenceTarget: config.features.referencePage ? "ontology-reference.html" : "index.html",
    documentName,
    w3idDirectorySegments,
    w3idDirectory: w3idDirectorySegments.join("/"),
    representations
  };
}

function copyPersistentIriRepresentations(persistentIri) {
  if (!persistentIri.enabled) {
    return;
  }
  ensureDir(LINKED_DATA_DIR);
  for (const representation of persistentIri.representations) {
    fs.copyFileSync(representation.sourcePath, path.join(SITE_DIR, representation.publicPath));
  }
}

function writePersistentIriDeploymentFiles(persistentIri) {
  const w3idDirectory = path.join(PERSISTENT_IRI_DIR, "w3id", ...persistentIri.w3idDirectorySegments);
  const htaccess = buildW3idHtaccess(persistentIri);
  writeText(path.join(PERSISTENT_IRI_DIR, "w3id-htaccess.txt"), htaccess);
  writeText(path.join(w3idDirectory, ".htaccess"), htaccess);
  writeText(path.join(PERSISTENT_IRI_DIR, "README.md"), buildPersistentIriReadme(persistentIri));
}

function buildW3idHtaccess(persistentIri) {
  const pattern = `^${escapeApacheRegex(persistentIri.documentName)}/?$`;
  const representationRules = persistentIri.representations
    .map(
      (representation) => `  RewriteCond %{HTTP:Accept} ${mediaTypeAcceptPattern(representation.mediaType)} [NC]\n  RewriteRule ${pattern} ${representation.url} [R=303,L,NE]`
    )
    .join("\n\n");
  return `# Generated by Ontology Companion Generator v${OCG_VERSION}.
# Place this file in w3id.org/${persistentIri.w3idDirectory}/.htaccess.
# It redirects RDF requests to static GitHub Pages assets and browser requests
# to the fragment-aware resolver page. Do not add a fragment to any target URL.

<IfModule mod_rewrite.c>
  RewriteEngine On

${representationRules}

  # A browser fragment such as #Term is not sent in HTTP. The resolver reads it
  # after this redirect and routes to the generated per-term HTML page.
  RewriteRule ${pattern} ${persistentIri.resolverUrl} [R=303,L,NE]
</IfModule>

<IfModule mod_headers.c>
  Header append Vary Accept
</IfModule>
`;
}

function mediaTypeAcceptPattern(mediaType) {
  return `(^|,|\\s)${escapeApacheRegex(mediaType)}($|,|;|\\s)`;
}

function escapeApacheRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPersistentIriReadme(persistentIri) {
  const representationList = persistentIri.representations
    .map((representation) => `- \`${representation.mediaType}\` -> ${representation.url}`)
    .join("\n");
  return `# Persistent IRI deployment bundle

Generated by OCG v${OCG_VERSION} for \`${persistentIri.documentIri}\`.

## What this bundle does

- Browsers are redirected to ${persistentIri.resolverUrl}. A fragment such as \`#Term\` remains in the browser and the resolver sends visitors to the matching generated term page.
- RDF clients that send a supported \`Accept\` media type are redirected to a static RDF representation of the full ontology.
- The server never receives a URI fragment, so this hash-IRI workflow cannot select a per-term RDF document. OCG intentionally returns the full ontology representation.

## Published representations

${representationList}

## Install on w3id.org

1. Copy \`w3id/${persistentIri.w3idDirectory}/.htaccess\` into the matching directory of the [w3id.org repository](https://github.com/perma-id/w3id.org).
2. Add the required w3id README for that directory and open a pull request following the w3id contribution guidance.
3. Deploy this repository's GitHub Pages site before merging the w3id redirect, so every redirect target exists.
4. Verify the deployed endpoint with the commands below.

## Verify

\`\`\`bash
# Browser: ${persistentIri.documentIri}#Capability
# should land on the generated terms/Capability.html page.

curl -L -H "Accept: ${persistentIri.representations[0].mediaType}" ${persistentIri.documentIri}
curl -I -L -H "Accept: ${persistentIri.representations[0].mediaType}" ${persistentIri.documentIri}
\`\`\`

The request sent by curl has no fragment because fragments are client-side only. The final response should point to the expected static RDF asset and expose the matching content type.
`;
}

// ---------------------------------------------------------------------------
// OOPS! (OntOlogy Pitfall Scanner!) integration
// ---------------------------------------------------------------------------

async function runPitfallScan(config, assets, options = {}) {
  const scanner = config.pitfallScanner;
  const report = {
    enabled: scanner.enabled,
    available: false,
    fromCache: false,
    error: "",
    serviceUrl: scanner.serviceUrl,
    requestedPitfalls: [...scanner.pitfalls],
    scannedAt: "",
    pitfalls: [],
    summary: { total: 0, byImportance: {} }
  };
  if (!scanner.enabled) {
    return report;
  }

  let rdfXml;
  try {
    rdfXml = await buildOntologyRdfXml(config, assets);
  } catch (error) {
    return failPitfallScan(report, scanner, `Could not prepare RDF/XML for the pitfall scan: ${error.message}`);
  }

  const cacheKey = crypto
    .createHash("sha256")
    .update([scanner.serviceUrl, scanner.pitfalls.join(","), rdfXml].join("\n"))
    .digest("hex");
  const cached = scanner.cache && !options.refresh ? readPitfallCache(cacheKey) : null;
  if (cached) {
    return { ...cached, fromCache: true };
  }
  if (options.skip) {
    return failPitfallScan(report, scanner, "Pitfall scan skipped (--skip-pitfall-scan) and no cached report was available.");
  }

  let responseBody;
  try {
    const response = await fetch(scanner.serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/rdf+xml" },
      body: buildOopsRequest(rdfXml, scanner.pitfalls),
      signal: AbortSignal.timeout(scanner.timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`the service responded with HTTP ${response.status}`);
    }
    responseBody = await response.text();
  } catch (error) {
    const reason = error.name === "TimeoutError" ? `no response within ${scanner.timeoutMs} ms` : error.message;
    return failPitfallScan(report, scanner, `Could not reach ${scanner.serviceUrl}: ${reason}`);
  }

  let parsed;
  try {
    parsed = await parseOopsResponse(responseBody);
  } catch (error) {
    return failPitfallScan(report, scanner, `Could not parse the OOPS! response: ${error.message}`);
  }
  if (parsed.error) {
    return failPitfallScan(report, scanner, `OOPS! rejected the ontology: ${parsed.error}`);
  }

  const completed = {
    ...report,
    available: true,
    scannedAt: new Date().toISOString(),
    pitfalls: parsed.pitfalls,
    summary: summarizePitfalls(parsed.pitfalls)
  };
  if (scanner.cache) {
    writePitfallCache(cacheKey, completed);
  }
  return completed;
}

function failPitfallScan(report, scanner, message) {
  if (scanner.failOnError) {
    throw new Error(message);
  }
  console.warn(`Warning: ${message}`);
  return { ...report, available: false, error: message, scannedAt: new Date().toISOString() };
}

function readPitfallCache(cacheKey) {
  try {
    const cached = JSON.parse(fs.readFileSync(PITFALL_CACHE_PATH, "utf8"));
    return cached.key === cacheKey ? cached.report : null;
  } catch {
    return null;
  }
}

function writePitfallCache(cacheKey, report) {
  try {
    ensureDir(CACHE_DIR);
    fs.writeFileSync(PITFALL_CACHE_PATH, `${JSON.stringify({ key: cacheKey, report }, null, 2)}\n`);
  } catch (error) {
    console.warn(`Warning: could not cache the pitfall report: ${error.message}`);
  }
}

// OOPS! only accepts RDF/XML ontology content, so any other configured input
// format is re-serialized from the quads OCG already knows how to parse.
async function buildOntologyRdfXml(config, assets) {
  const ontologyAsset = assets.find((asset) => asset.key === "ontology");
  const format = resolveOntologyFormat(config.sources.ontology, config.sources.ontologyFormat || "auto");
  if (format === "rdfxml") {
    return fs.readFileSync(ontologyAsset.sourcePath, "utf8");
  }
  const parsed = await parseOntologySource(ontologyAsset.sourcePath, format);
  return serializeQuadsToRdfXml(parsed.quads, parsed.prefixes);
}

function buildOopsRequest(rdfXml, pitfalls) {
  const content = rdfXml.replaceAll("]]>", "]]]]><![CDATA[>");
  return `<?xml version="1.0" encoding="UTF-8"?>
<OOPSRequest>
<OntologyURI></OntologyURI>
<OntologyContent><![CDATA[${content}]]></OntologyContent>
<Pitfalls>${escapeHtml(pitfalls.join(","))}</Pitfalls>
<OutputFormat>RDF/XML</OutputFormat>
</OOPSRequest>`;
}

function splitNamespaceUri(uri) {
  let index = uri.length;
  while (index > 0 && /[A-Za-z0-9_.-]/.test(uri[index - 1])) {
    index -= 1;
  }
  while (index < uri.length && !/[A-Za-z_]/.test(uri[index])) {
    index += 1;
  }
  return index > 0 && index < uri.length ? { base: uri.slice(0, index), local: uri.slice(index) } : null;
}

function serializeQuadsToRdfXml(quads, prefixes = []) {
  const declarations = new Map([["rdf", RDF_NAMESPACE]]);
  const prefixByBase = new Map([[RDF_NAMESPACE, "rdf"]]);
  let generated = 0;
  const prefixFor = (base) => {
    if (prefixByBase.has(base)) {
      return prefixByBase.get(base);
    }
    const declared = prefixes.find(
      (entry) => entry.base === base && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(entry.prefix) && !declarations.has(entry.prefix)
    );
    let prefix = declared?.prefix;
    while (!prefix || declarations.has(prefix)) {
      prefix = `ns${generated}`;
      generated += 1;
    }
    declarations.set(prefix, base);
    prefixByBase.set(base, prefix);
    return prefix;
  };

  const subjects = new Map();
  const skipped = [];
  for (const quad of quads) {
    if (quad.predicate.termType !== "NamedNode") {
      continue;
    }
    const split = splitNamespaceUri(quad.predicate.value);
    if (!split) {
      skipped.push(quad.predicate.value);
      continue;
    }
    const key = `${quad.subject.termType}:${quad.subject.value}`;
    if (!subjects.has(key)) {
      subjects.set(key, { term: quad.subject, properties: [] });
    }
    subjects.get(key).properties.push({ qname: `${prefixFor(split.base)}:${split.local}`, object: quad.object });
  }
  if (skipped.length) {
    console.warn(`Warning: ${skipped.length} triple(s) use a predicate IRI that cannot be written as RDF/XML and were omitted from the pitfall scan.`);
  }

  const body = [...subjects.values()]
    .map(({ term, properties }) => {
      const identifier = term.termType === "BlankNode"
        ? ` rdf:nodeID="${escapeHtml(term.value)}"`
        : ` rdf:about="${escapeHtml(term.value)}"`;
      const rendered = properties
        .map(({ qname, object }) => {
          if (object.termType === "NamedNode") {
            return `    <${qname} rdf:resource="${escapeHtml(object.value)}"/>`;
          }
          if (object.termType === "BlankNode") {
            return `    <${qname} rdf:nodeID="${escapeHtml(object.value)}"/>`;
          }
          const annotation = object.language
            ? ` xml:lang="${escapeHtml(object.language)}"`
            : object.datatype?.value
              ? ` rdf:datatype="${escapeHtml(object.datatype.value)}"`
              : "";
          return `    <${qname}${annotation}>${escapeHtml(object.value)}</${qname}>`;
        })
        .join("\n");
      return `  <rdf:Description${identifier}>\n${rendered}\n  </rdf:Description>`;
    })
    .join("\n");

  const namespaceAttributes = [...declarations.entries()]
    .map(([prefix, base]) => `  xmlns:${prefix}="${escapeHtml(base)}"`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF\n${namespaceAttributes}>\n${body}\n</rdf:RDF>\n`;
}

async function parseOopsResponse(xml) {
  const quads = [];
  const parserStream = rdfParser.parse(Readable.from([xml]), { contentType: "application/rdf+xml", baseIRI: OOPS_NAMESPACE });
  await new Promise((resolve, reject) => {
    parserStream.on("data", (quad) => quads.push(quad));
    parserStream.on("error", reject);
    parserStream.on("end", resolve);
  });

  // OOPS! has moved its vocabulary namespace at least once, so descriptions are
  // matched on the local name rather than the full predicate IRI.
  const localName = (uri) => uri.slice(Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/")) + 1);
  const descriptions = new Map();
  for (const quad of quads) {
    const key = quad.subject.value;
    if (!descriptions.has(key)) {
      descriptions.set(key, new Map());
    }
    const properties = descriptions.get(key);
    const property = quad.predicate.value === RDF_TYPE ? "@type" : localName(quad.predicate.value);
    if (!properties.has(property)) {
      properties.set(property, []);
    }
    properties.get(property).push(quad.object.value);
  }

  const typedAs = (properties, type) => (properties.get("@type") || []).some((value) => localName(value) === type);
  const first = (properties, key) => (properties.get(key) || [])[0] || "";

  const errorSubject = [...descriptions.values()].find(
    (properties) => typedAs(properties, "response") && !properties.has("hasPitfall") && properties.has("hasTitle")
  );
  if (errorSubject) {
    const messages = errorSubject.get("hasMessage") || [];
    return { pitfalls: [], error: [first(errorSubject, "hasTitle"), ...messages].filter(Boolean).join(" ") };
  }

  const pitfalls = [];
  for (const [subject, properties] of descriptions) {
    if (!typedAs(properties, "pitfall")) {
      continue;
    }
    const affected = new Set(properties.get("hasAffectedElement") || []);
    for (const key of ["noSuggestion", "hasSuggestion", "mightNotBeInverseOf", "hasEquivalentClass", "hasEquivalentProperty"]) {
      for (const reference of properties.get(key) || []) {
        for (const element of descriptions.get(reference)?.get("hasAffectedElement") || []) {
          affected.add(element);
        }
      }
    }
    const declaredCount = Number.parseInt(first(properties, "hasNumberAffectedElements"), 10);
    pitfalls.push({
      id: subject,
      code: first(properties, "hasCode"),
      name: first(properties, "hasName"),
      description: first(properties, "hasDescription").trim(),
      importanceLevel: first(properties, "hasImportanceLevel") || "Minor",
      numberAffectedElements: Number.isFinite(declaredCount) ? declaredCount : affected.size,
      affectedElements: [...affected].sort(collator.compare)
    });
  }

  pitfalls.sort((left, right) => {
    const leftRank = OOPS_IMPORTANCE_ORDER.indexOf(left.importanceLevel);
    const rightRank = OOPS_IMPORTANCE_ORDER.indexOf(right.importanceLevel);
    const rankDiff = (leftRank === -1 ? OOPS_IMPORTANCE_ORDER.length : leftRank) - (rightRank === -1 ? OOPS_IMPORTANCE_ORDER.length : rightRank);
    return rankDiff !== 0 ? rankDiff : collator.compare(left.code, right.code);
  });

  return { pitfalls, error: "" };
}

function summarizePitfalls(pitfalls) {
  const byImportance = {};
  for (const pitfall of pitfalls) {
    byImportance[pitfall.importanceLevel] = (byImportance[pitfall.importanceLevel] || 0) + 1;
  }
  return {
    total: pitfalls.length,
    affectedElements: new Set(pitfalls.flatMap((pitfall) => pitfall.affectedElements)).size,
    byImportance
  };
}

function copyBrandingAssets(config) {
  const headerImage = getBrandingAsset(config.site.branding.headerImage, "headerImage");
  if (headerImage) {
    const destination = path.join(SITE_DIR, headerImage.publicPath);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(headerImage.sourcePath, destination);
  }

  const favicon = getBrandingAsset(config.site.branding.favicon, "favicon");
  if (favicon) {
    fs.copyFileSync(favicon.sourcePath, path.join(SITE_DIR, favicon.fileName));
  } else {
    fs.copyFileSync(
      getProjectOrPackageResource(FAVICON_PNG_PROJECT_PATH, FAVICON_PNG_TEMPLATE_PATH),
      path.join(SITE_DIR, "favicon.png")
    );
    fs.copyFileSync(
      getProjectOrPackageResource(FAVICON_ICO_PROJECT_PATH, FAVICON_ICO_TEMPLATE_PATH),
      path.join(SITE_DIR, "favicon.ico")
    );
  }
  fs.copyFileSync(FAVICON_PNG_TEMPLATE_PATH, path.join(SITE_DIR, "ocg-favicon.png"));
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
      <header class="site-header ocg-spec-header">
        <a class="brand" href="../index.html">
          ${buildBrandMark(config, "../")}
          <span class="brand-copy">
            <strong>${escapeHtml(config.project.title)}</strong>
            <span>${escapeHtml(config.project.namespace)}</span>
          </span>
        </a>
        <nav class="site-nav" aria-label="Companion site navigation">${nav}${specHowTo}</nav>
      </header>
    </div>
    <script>
      (() => {
        const shell = document.querySelector(".ocg-spec-nav-shell");
        if (!shell || typeof ResizeObserver !== "function") return;
        new ResizeObserver(() => {
          document.body.style.setProperty("--ocg-spec-header-height", shell.offsetHeight + "px");
        }).observe(shell);
      })();
    </script>
  `;
  const headAdditions = [
    buildFaviconLinks(config, "../"),
    buildPersistentIriLinkTags(config),
    buildFontLinks(config),
    buildStylesheetLinks(config, "../", "spec")
  ]
    .filter(Boolean)
    .join("\n  ");
  const styledSource = source.replace(/<\/head>/i, () => `${headAdditions}\n  </head>`);
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
    objectLiteral: quad.object.termType === "Literal" ? quad.object.value : null,
    objectLanguage: quad.object.termType === "Literal" ? quad.object.language || "" : ""
  }));
  const namespace = config.project.namespace;
  if (!prefixes.some((entry) => entry.base === namespace)) {
    prefixes.unshift({ prefix: "vocab", base: namespace });
  }

  const ontologyMetadata = extractOntologyMetadata(triples, config);
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
      term.labelPredicate = triple.predicateUri;
      term.labelLanguage = triple.objectLanguage;
    } else if (
      (triple.predicateUri === RDFS_COMMENT || triple.predicateUri === SKOS_DEFINITION) &&
      triple.objectLiteral
    ) {
      term.comment = triple.objectLiteral;
      term.commentPredicate = triple.predicateUri;
      term.commentLanguage = triple.objectLanguage;
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
  assignTermPageNames(nodes);
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
    ontology: ontologyMetadata,
    prefixes,
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

// vann:preferredNamespacePrefix / vann:preferredNamespaceUri are annotations on the
// ontology header rather than on a declared term, so they need their own pass.
function extractOntologyMetadata(triples, config) {
  const namespace = config.project.namespace;
  const documentIri = namespace.replace(/[#/]$/, "");
  const ontologyIris = triples
    .filter((triple) => triple.predicateUri === RDF_TYPE && triple.objectUri === OWL_ONTOLOGY && triple.subjectUri)
    .map((triple) => triple.subjectUri);
  const preferredIri = [config.project.canonicalUri, documentIri, namespace].find((candidate) =>
    candidate && ontologyIris.includes(candidate)
  );
  const iri = preferredIri || ontologyIris[0] || "";
  const annotation = (predicateUri) => {
    const scoped = triples.find(
      (triple) => triple.predicateUri === predicateUri && triple.subjectUri === iri && triple.objectLiteral
    );
    const fallback = triples.find((triple) => triple.predicateUri === predicateUri && triple.objectLiteral);
    return (scoped || fallback)?.objectLiteral || "";
  };

  const literal = (predicateUris) => {
    const match = triples.find(
      (triple) => predicateUris.includes(triple.predicateUri) && triple.subjectUri === iri && triple.objectLiteral
    );
    return match
      ? { value: match.objectLiteral, predicate: match.predicateUri, language: match.objectLanguage }
      : null;
  };

  return {
    iri,
    label: literal([RDFS_LABEL, SKOS_PREF_LABEL]),
    comment: literal([RDFS_COMMENT, SKOS_DEFINITION]),
    preferredNamespacePrefix:
      config.project.preferredNamespacePrefix || annotation(VANN_PREFERRED_NAMESPACE_PREFIX),
    preferredNamespaceUri:
      config.project.preferredNamespaceUri || annotation(VANN_PREFERRED_NAMESPACE_URI) || namespace
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
      labelPredicate: "",
      labelLanguage: "",
      comment: "",
      commentPredicate: "",
      commentLanguage: "",
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

function predicateIriForRelation(relation) {
  return {
    subClassOf: RDFS_SUBCLASS_OF,
    domain: RDFS_DOMAIN,
    range: RDFS_RANGE,
    broader: SKOS_BROADER
  }[relation] || "";
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
    return `<a class="hierarchy-term" href="${termPageHref(node, "terms/")}">${content}</a>`;
  }
  return `<span class="hierarchy-term">${content}</span>`;
}

function writeTermPages(context) {
  const declaredNodes = context.ontologyInfo.nodes.filter((node) => !node.isExternal);
  writeText(path.join(TERMS_DIR, "index.html"), buildTermsIndexPage(context, declaredNodes));

  for (const node of declaredNodes) {
    writeText(path.join(TERMS_DIR, termPageHref(node)), buildTermPage(context, node));
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

function guideComponentSection({ id, badge, title, description, options, example, exampleNote }) {
  const note = exampleNote || "This example includes every option described in this component section. Remove optional entries you do not need.";
  return `
    <section id="${escapeHtml(id)}" class="section guide-section guide-component">
      <div class="section-head"><div><div class="term-badge">${escapeHtml(badge)}</div><h2>${escapeHtml(title)}</h2></div><p class="section-note">${escapeHtml(description)}</p></div>
      ${guideOptions(options)}
      <h3>Example</h3>
      <p class="guide-example-note">${escapeHtml(note)}</p>
      ${guideCode(example)}
    </section>`;
}

function themeComponentGuideRows() {
  const optionPaths = themeComponentOptionPaths();
  return Object.entries(THEME_COMPONENTS).flatMap(([component, { description }]) => [
    [`theme.components.${component}`, description],
    ...optionPaths
      .filter(([name]) => name === component)
      .map((optionPath) => [
        `theme.components.${optionPath.join(".")}`,
        `${THEME_OPTION_DESCRIPTIONS[optionPath.at(-1)]}. Sets ${themeTokenName(optionPath)}.`
      ])
  ]);
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
      usageGuidePage: true,
      embeddedJsonLd: true
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
          forceAllUnder: 80,
          edgeLabels: true,
          edgeLabelSize: 11
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
    persistentIri: {
      enabled: false,
      documentIri: "",
      siteUrl: "",
      representations: []
    },
    theme: {
      fonts: {
        heading: "IBM Plex Sans",
        body: "IBM Plex Sans",
        mono: "IBM Plex Mono"
      },
      colors: {
        pageBackground: "#f7f7f8",
        pageBackgroundAlt: "#f0f2f4",
        panelBackground: "#ffffff",
        cardBackground: "#ffffff",
        text: "#1c1f23",
        mutedText: "#5d6672",
        accent: "#1f6f78",
        accentBorder: "#1f6f78",
        accentStrong: "#13535a",
        border: "#e3e5e8"
      },
      radius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px"
      },
      components: {},
      customCss: ""
    },
    site: {
      basePath: "/",
      branding: {
        headerImage: "source/branding/vocabulary-logo.svg",
        favicon: "source/branding/vocabulary-favicon.svg"
      },
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
        title: "On this page",
        collapseLabel: "Collapse page contents",
        expandLabel: "Expand page contents"
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
          preferredNamespacePrefix: "Preferred Prefix",
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
    pitfallScanner: {
      enabled: false,
      serviceUrl: "https://oops.linkeddata.es/rest",
      pitfalls: [],
      timeoutMs: 60000,
      failOnError: false,
      cache: true
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
        ["project.preferredNamespacePrefix", "Optional override for the prefix shown under Canonical URI. When omitted, OCG reads vann:preferredNamespacePrefix from the ontology header and hides the field if neither is present."],
        ["project.preferredNamespaceUri", "Optional override for vann:preferredNamespaceUri; defaults to the ontology annotation, then to project.namespace."],
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
        ["site.home.metadata", "Home metadata labels and namespace-copy status messages. Set canonicalUri, preferredNamespacePrefix, version, maintainer, unspecified, copyNamespace, namespaceCopied, and namespaceCopyUnavailable."],
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
      id: "persistent-iri",
      badge: "Linked Data Deployment",
      title: "Persistent IRI and Content Negotiation",
      description: "Optionally turns a hash-based w3id.org namespace into a browser-friendly term resolver plus a generated w3id Apache configuration for RDF content negotiation. GitHub Pages remains a static host; w3id performs the Accept-header redirect.",
      options: [
        ["persistentIri.enabled", "Set to true to generate iri-resolver.html, stable linked-data RDF copies, and a site/persistent-iri/ w3id deployment bundle. Requires features.termPages and a hash namespace."],
        ["persistentIri.documentIri", "No-fragment persistent document IRI at w3id.org, for example https://w3id.org/your-project/vocab. It must equal project.namespace without its trailing #."],
        ["persistentIri.siteUrl", "Public HTTPS GitHub Pages base URL for the deployed site, including the repository path and trailing slash. OCG uses it to write absolute redirect targets."],
        ["persistentIri.representations", "Optional extra full-ontology RDF serializations. The configured primary ontology file is always published automatically under linked-data/ with its detected media type."],
        ["persistentIri.representations[].mediaType", "One of text/turtle, application/rdf+xml, application/ld+json, or application/n-triples. Each media type can appear once."],
        ["persistentIri.representations[].path", "Repository-relative path to an already serialized full ontology in the declared media type. OCG copies it; it does not convert RDF formats."],
        ["persistentIri.representations[].destinationName", "Simple filename with the matching extension, such as vocabulary.jsonld. It is written under site/linked-data/."],
        ["Generated site/persistent-iri/", "Contains README.md, a copyable w3id-htaccess.txt, and the same .htaccess under its intended w3id directory path. Copy it to the w3id.org repository and submit the required w3id pull request."],
        ["Generated HTML alternate links", "When enabled, generated HTML pages include rel=alternate links to the published RDF representations as a static-host fallback for clients that first retrieve HTML."]
      ],
      example: {
        project: {
          namespace: "https://w3id.org/your-project/vocab#"
        },
        persistentIri: {
          enabled: true,
          documentIri: "https://w3id.org/your-project/vocab",
          siteUrl: "https://your-account.github.io/your-ontology-repository/",
          representations: [
            {
              mediaType: "application/ld+json",
              path: "source/ontology/your-vocabulary.jsonld",
              destinationName: "your-vocabulary.jsonld"
            }
          ]
        }
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
        ["graph.custom.labels.edgeLabels", "Initial state of the 'Show predicate labels on edges' toggle. When on, each visible edge carries its prefixed predicate IRI so it can be read without hovering."],
        ["graph.custom.labels.edgeLabelSize", "Font size in pixels for edge labels. Labels wider than the edge they annotate are omitted rather than truncated."],
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
      id: "pitfalls",
      badge: "Optional Page",
      title: "Ontology Pitfall Report",
      description: "Submits the configured ontology to OOPS! (OntOlogy Pitfall Scanner!) during the build and renders the returned pitfalls as ontology-pitfalls.html. Disabled by default: it is the only OCG feature that contacts a remote service at build time.",
      options: [
        ["pitfallScanner.enabled", "Set to true to run the scan and generate ontology-pitfalls.html with its navigation link."],
        ["pitfallScanner.serviceUrl", "OOPS! REST endpoint. Point it at a self-hosted instance to keep ontology content inside your infrastructure."],
        ["pitfallScanner.pitfalls", "Optional list of OOPS! pitfall codes such as ['P04', 'P11'] to scan for. Leave empty to request the full catalogue."],
        ["pitfallScanner.timeoutMs", "Request timeout in milliseconds, between 1000 and 600000."],
        ["pitfallScanner.failOnError", "Set to true to fail the build when the scan cannot complete. When false, OCG warns and publishes the page with an unavailable notice."],
        ["pitfallScanner.cache", "Caches the report in .ocg-cache/ keyed by the submitted ontology, so repeated builds of unchanged sources do not re-contact the service."],
        ["--refresh-pitfalls", "Build flag that ignores the cache and requests a fresh report."],
        ["--skip-pitfall-scan", "Build flag that uses the cached report when present and skips the network request otherwise."]
      ],
      example: { pitfallScanner: configExample.pitfallScanner }
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
      id: "embedded-json-ld",
      badge: "Machine Readable",
      title: "Embedded JSON-LD",
      description: "Publishes the parsed RDF inside the generated HTML, so an agent that fetches a page gets machine-readable data without content negotiation. The home page carries the ontology header, the Reference page carries the whole vocabulary as an @graph, and each term page carries that term.",
      options: [
        ["features.embeddedJsonLd", "Set to false to omit every JSON-LD script block."],
        ["Fidelity", "The emitted graph is a subset of the parsed ontology: the predicate that actually supplied a label or comment is re-used (rdfs:label or skos:prefLabel) and language tags are preserved."],
        ["rdfs:isDefinedBy", "The one statement OCG adds itself, linking each term to the ontology IRI it was declared in."],
        ["Hash namespaces", "Embedded data is reached by agents that fetch the term page directly. A client dereferencing a hash IRI such as vocab#Term still requests the no-fragment document, so this complements persistentIri rather than replacing it."]
      ],
      example: { features: { embeddedJsonLd: true } }
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
      description: "Applies site-wide branding images, fonts, colors, page table-of-contents behavior, footer copy, and OCG attribution links.",
      options: [
        ["site.basePath", "Deployment base-path setting retained for repository configuration; generated links are currently relative."],
        ["site.branding.headerImage", "Optional repository-relative image shown in place of project.shortName inside the square header mark on every companion page and the ReSpec navigation. Supported: .png, .jpg, .jpeg, .webp, .gif, and .svg."],
        ["site.branding.favicon", "Optional repository-relative browser favicon. Supported: .ico, .png, and .svg. When omitted, OCG keeps the source/branding/favicon.png and favicon.ico fallback behavior."],
        ["theme.fonts.heading", "Font family for headings and brand text. Google Fonts families are loaded automatically; generic families such as system-ui skip the font request."],
        ["theme.fonts.body", "Font family for body copy and interface text."],
        ["theme.fonts.mono", "Font family for code, IRIs, and source content."],
        ["theme.colors.pageBackground", "Page background color."],
        ["theme.colors.pageBackgroundAlt", "Subtle fill for table headers, code blocks, tabs, and metadata tiles."],
        ["theme.colors.panelBackground", "Background color for section panels."],
        ["theme.colors.cardBackground", "Background color for cards inside panels."],
        ["theme.colors.text", "Primary text and heading color."],
        ["theme.colors.mutedText", "Secondary text color."],
        ["theme.colors.accent", "Links, primary buttons, and the brand mark."],
        ["theme.colors.accentStart", "Legacy gradient color. The default theme no longer uses it; custom CSS can read it as --ocg-color-accent-start."],
        ["theme.colors.accentBorder", "Border color for primary buttons."],
        ["theme.colors.accentStrong", "Hover and emphasis color for accent elements."],
        ["theme.colors.border", "Shared border color. Subtle dividers and stronger control borders are derived from it."],
        ["theme.colors.warmAccent", "Legacy highlight color. The default theme no longer uses it; custom CSS can read it as --ocg-color-warm-accent."],
        ["site.toc.enabled", "Set to false to remove the contextual table of contents from Home, Reference, Terms, and term-detail pages."],
        ["site.toc.title", "Heading for the contextual table of contents. It is shown only when a page has multiple sections."],
        ["site.toc.collapseLabel", "Accessible label and tooltip for the control that collapses the TOC rail and expands the page content."],
        ["site.toc.expandLabel", "Accessible label and tooltip for the control that restores the expanded TOC rail."],
        ["site.footer.primary", "Primary footer sentence."],
        ["site.footer.secondary", "Secondary footer sentence."],
        ["site.generator.repositoryUrl", "Optional link to the OCG repository in the generated footer."],
        ["site.generator.documentationUrl", "Optional link to OCG documentation in the generated footer."]
      ],
      example: {
        site: {
          basePath: configExample.site.basePath,
          branding: configExample.site.branding,
          toc: configExample.site.toc,
          footer: configExample.site.footer,
          generator: configExample.site.generator
        },
        theme: {
          fonts: configExample.theme.fonts,
          colors: configExample.theme.colors
        }
      },
      exampleNote: "This example includes every option in this section except the legacy accentStart and warmAccent colors. Remove optional entries you do not need."
    },
    {
      id: "styling",
      badge: "Shared Styling",
      title: "Component Styling",
      description: "Adjusts the shared corner radius scale, overrides individual components such as buttons, cards, and panels, or loads a custom stylesheet for anything else.",
      options: [
        ["theme.radius.sm", "Radius for badges and small labels. Default 4px. Numbers are read as pixels."],
        ["theme.radius.md", "Radius for buttons, inputs, tabs, and navigation links. Default 6px."],
        ["theme.radius.lg", "Radius for cards, tables, and code blocks. Default 8px."],
        ["theme.radius.xl", "Radius for section panels and the page table of contents. Default 10px."],
        ...themeComponentGuideRows(),
        ["theme.customCss", "Optional repository-relative .css file loaded after the generated stylesheet on every page, including the ReSpec page (body.ocg-spec-page). Its rules take precedence over OCG's layered styles, so it can override any --ocg-* variable or selector."]
      ],
      example: {
        theme: {
          radius: { sm: "2px", md: "4px", lg: "6px", xl: "8px" },
          components: {
            button: { fontWeight: 600, primary: { background: "#0f5c63", hoverBackground: "#0a4449" } },
            panel: { shadow: "none" },
            card: { shadow: "sm", padding: "20px" },
            badge: { background: "transparent", border: "#c9d7d9" }
          },
          customCss: "source/branding/site.css"
        }
      },
      exampleNote: "This example overrides a few representative options. Any option listed above can be added the same way; omitted options keep the defaults."
    }
  ];
  const componentSectionsHtml = componentSections.map(guideComponentSection).join("");
  const guideTocItems = [
    { id: "existing-repository", label: "Existing Repository Integration", level: 0, marker: "01" },
    { id: "getting-started", label: "Getting Started", level: 0, marker: "02" },
    { id: "repository-layout", label: "Repository Layout", level: 0, marker: "03" },
    { id: "accepted-input-formats", label: "Accepted Input Formats", level: 0, marker: "04" },
    { id: "w3id-publication", label: "End-to-End w3id Publication", level: 0, marker: "05" },
    { id: "persistent-iri-workflow", label: "Persistent IRI Deployment", level: 0, marker: "06" },
    { id: "components", label: "Component Overview", level: 0, marker: "07" },
    ...componentSections.map(({ id, title }) => ({ id, label: title, level: 1, marker: "" })),
    { id: "configuration", label: "Complete Configuration", level: 0, marker: "08" },
    { id: "github-pages", label: "GitHub Pages", level: 0, marker: "09" },
    { id: "commands", label: "Useful Commands", level: 0, marker: "10" }
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

      <section id="w3id-publication" class="section guide-section">
        <div class="section-head"><h2>End-to-End w3id Publication</h2><p class="section-note">Follow these steps when starting with an existing ontology repository and ending with a GitHub Pages companion site that resolves through w3id.org.</p></div>
        <div class="guide-callout"><strong>What you are building:</strong> GitHub Pages hosts the generated HTML and RDF files. w3id.org holds the permanent redirect rules and uses the HTTP <code>Accept</code> header to select an RDF representation. OCG prepares both sides, but you submit the w3id change separately.</div>
        <ol class="guide-steps">
          <li><strong>Start with a public ontology repository.</strong> Keep your primary ontology in its existing location. OCG accepts Turtle, RDF/XML, JSON-LD, and N-Triples as the primary ontology input; see <a href="#accepted-input-formats">Accepted Input Formats</a> before choosing the <code>--ontology</code> path.</li>
          <li><strong>Install and initialize OCG.</strong> From the repository root, run <code>npm install --save-dev ontology-companion-generator</code>, then <code>npx ocg init --ontology path/to/ontology.ttl</code>. Replace the example path with your actual ontology file and use the matching extension for RDF/XML, JSON-LD, or N-Triples.</li>
          <li><strong>Review the generated config.</strong> Update <code>project</code>, <code>sources</code>, feature switches, and page copy in <code>ocg.config.json</code>. Source paths are repository-relative, and OCG does not convert RDF formats or scan arbitrary directories.</li>
          <li><strong>Choose the permanent identifier before publishing.</strong> Ask w3id for an available project path, such as <code>https://w3id.org/ocg/example-capability-vocabulary</code> for this bundled demonstration. This is a candidate example, not a guarantee of availability. Use the exact approved path in both the ontology namespace and OCG configuration.</li>
          <li><strong>Update the ontology namespace consistently.</strong> For a hash namespace, use the document IRI plus <code>#</code>, for example <code>https://w3id.org/ocg/example-capability-vocabulary#</code>. Update prefixes and ontology IRIs in the ontology, examples, SHACL, ShEx, and specification source where they refer to the old namespace. OCG copies source files; it does not rewrite IRIs.</li>
          <li><strong>Enable persistent IRI output.</strong> Set <code>persistentIri.enabled</code> to <code>true</code>, set <code>documentIri</code> to the no-fragment w3id IRI, and set <code>siteUrl</code> to the final GitHub Pages base URL, including its repository path and trailing slash.</li>
          <li><strong>Validate and build locally.</strong> Run <code>npm run ocg:check</code>, then <code>npm run ocg:build</code>. Inspect the generated pages and confirm that <code>site/linked-data/ontology.ttl</code>, <code>site/iri-resolver.html</code>, and <code>site/persistent-iri/</code> exist.</li>
          <li><strong>Deploy GitHub Pages first.</strong> In GitHub, open <strong>Settings → Pages</strong> and select <strong>GitHub Actions</strong>. Commit the config and source changes, push <code>main</code>, and confirm that the Pages workflow succeeds. The static RDF target must work before w3id redirects are merged.</li>
          <li><strong>Prepare the w3id pull request.</strong> Fork the <a href="https://github.com/perma-id/w3id.org" target="_blank" rel="noreferrer">w3id.org repository</a>. Copy the generated <code>site/persistent-iri/w3id/&lt;project&gt;/.htaccess</code> and add a README with the identifier, GitHub Pages target, maintainer, and contact information. For the example path above, copy <code>site/persistent-iri/w3id/ocg/.htaccess</code> into the <code>ocg/</code> directory of the w3id fork. Submit the pull request following the <a href="https://github.com/perma-id/w3id.org#creating-a-new-identifier" target="_blank" rel="noreferrer">w3id contribution guide</a>.</li>
          <li><strong>Test both representations.</strong> After the w3id change is merged, open a term IRI such as <code>https://w3id.org/ocg/example-capability-vocabulary#Capability</code> in a browser and request the no-fragment document IRI with <code>Accept: text/turtle</code> from an RDF client.</li>
        </ol>
        <h3>Minimal persistent-IRI configuration</h3>
        ${guideCode({
          project: {
            namespace: "https://w3id.org/ocg/example-capability-vocabulary#",
            canonicalUri: "https://w3id.org/ocg/example-capability-vocabulary"
          },
          persistentIri: {
            enabled: true,
            documentIri: "https://w3id.org/ocg/example-capability-vocabulary",
            siteUrl: "https://ecrum19.github.io/ocg/",
            representations: []
          }
        })}
        <p>For another ontology, replace the example identifier and Pages URL with your approved values. Keep <code>documentIri</code> free of <code>#</code>; use the fragment only when linking to a term.</p>
        <h3>Final verification</h3>
        ${guideCode("curl -L -H 'Accept: text/turtle' https://w3id.org/ocg/example-capability-vocabulary\ncurl -I -L -H 'Accept: text/turtle' https://w3id.org/ocg/example-capability-vocabulary")}
        <p>The RDF request should redirect to <code>linked-data/ontology.ttl</code>. A browser request for <code>https://w3id.org/ocg/example-capability-vocabulary#Capability</code> should reach <code>terms/Capability.html</code>. If you add JSON-LD, RDF/XML, or N-Triples files under <code>persistentIri.representations</code>, repeat the curl test with each configured media type.</p>
        <div class="guide-callout"><strong>Common mistake:</strong> do not submit the generated <code>.htaccess</code> before the GitHub Pages target exists, and do not point <code>documentIri</code> at a namespace ending in <code>#</code>. A server never receives a hash fragment, so w3id negotiates the full ontology while OCG resolves browser fragments to individual term pages.</div>
      </section>

      <section id="persistent-iri-workflow" class="section guide-section persistent-iri-section">
        <div class="section-head"><h2>Persistent IRI Deployment</h2><p class="section-note">OCG can prepare static GitHub Pages output for linked-data dereferencing, with w3id.org providing the HTTP behavior that static hosting cannot.</p></div>
        <p>A term IRI such as <code class="iri-example">https://w3id.org/your-project/vocab#Capability</code> has two jobs. In a browser, visitors should reach the generated <code>terms/Capability.html</code> page. In an RDF client, a request for the no-fragment document IRI with <code>Accept: text/turtle</code> should receive an RDF representation. GitHub Pages can serve both static files, but it cannot inspect the <code>Accept</code> header and choose between them.</p>
        <div class="guide-callout guide-callout--instruction"><strong>How to generate the w3id configuration:</strong> set <code>persistentIri.enabled</code> to <code>true</code>, provide the matching w3id document IRI and deployed GitHub Pages URL, then run <code>npm run ocg:build</code>. Copy <code>site/persistent-iri/w3id/&lt;project&gt;/.htaccess</code> and the generated <code>README.md</code> into the corresponding identifier directory in your <a href="https://github.com/perma-id/w3id.org#creating-a-new-identifier" target="_blank" rel="noreferrer">w3id persistent-identifier publishing guide</a> pull request.</div>
        <ol class="guide-steps">
          <li><strong>Use a hash namespace.</strong> Set <code>project.namespace</code> to a w3id document IRI plus <code>#</code>, for example <code>https://w3id.org/your-project/vocab#</code>.</li>
          <li><strong>Publish static targets.</strong> OCG copies the primary ontology and any additional serializations into <code>site/linked-data/</code>. It does not convert RDF: provide each representation you intend to offer.</li>
          <li><strong>Let w3id negotiate.</strong> The generated <code>.htaccess</code> checks <code>Accept</code>, issues a <code>303</code> redirect to an RDF file when a supported media type is requested, and otherwise redirects to <code>iri-resolver.html</code>.</li>
          <li><strong>Resolve the browser fragment client-side.</strong> URI fragments are never sent in an HTTP request. The resolver receives the preserved <code>#Capability</code> fragment in the browser and routes to the generated term page.</li>
        </ol>
        <div class="guide-callout"><strong>Important limitation:</strong> because a server never receives <code>#Capability</code>, hash-based IRIs cannot negotiate RDF for one selected term. OCG returns a representation of the full ontology. Per-term RDF requires a different IRI design, such as slash IRIs, and server-side routing. See the <a href="https://github.com/perma-id/w3id.org#creating-a-new-identifier" target="_blank" rel="noreferrer">w3id explanation of identifier redirects</a> and its <a href="https://github.com/perma-id/w3id.org/tree/master/examples" target="_blank" rel="noreferrer"><code>.htaccess</code> examples</a> for more context.</div>
        <h3>Configuration example</h3>
        ${guideCode({
          project: { namespace: "https://w3id.org/your-project/vocab#" },
          persistentIri: {
            enabled: true,
            documentIri: "https://w3id.org/your-project/vocab",
            siteUrl: "https://your-account.github.io/your-ontology-repository/",
            representations: [
              {
                mediaType: "application/ld+json",
                path: "source/ontology/your-vocabulary.jsonld",
                destinationName: "your-vocabulary.jsonld"
              }
            ]
          }
        })}
        <h3>Deploy and verify</h3>
        <ol class="guide-steps">
          <li>Build and deploy the GitHub Pages site first.</li>
          <li>Copy <code>site/persistent-iri/w3id/&lt;project&gt;/.htaccess</code> and follow the required contribution process in the <a href="https://github.com/perma-id/w3id.org" target="_blank" rel="noreferrer">w3id.org repository</a>.</li>
          <li>Use the generated <code>site/persistent-iri/README.md</code> for the exact redirect targets and curl commands.</li>
        </ol>
        <p>For a Python-first local ontology exploration workflow, see <a href="https://github.com/lambdamusic/Ontospy" target="_blank" rel="noreferrer">Ontospy</a>. OCG addresses a complementary use case: Node-based generation, configurable companion pages, and GitHub Pages deployment from the ontology repository.</p>
      </section>

      <section id="components" class="section guide-section">
        <div class="section-head"><h2>Companion Site Components</h2><p class="section-note">Use the component-level How To links throughout the site to return directly to these explanations. Each detailed section includes an option table and a complete example.</p></div>
        <div class="guide-grid">
          <article id="package-cli-summary" class="guide-card"><div class="term-badge">Developer Workflow</div><h3><a href="#package-cli">Package and CLI</a></h3><p>Install OCG as a development dependency and use the CLI to initialize, validate, build, preview, and clean the companion site.</p><p><strong>Customize:</strong> CLI paths, output directory, local preview host, and the full <code>ocg.config.json</code> surface.</p></article>
          <article id="home-summary" class="guide-card"><div class="term-badge">Landing Page</div><h3><a href="#home">Home</a></h3><p>The home page presents your project identity, navigation, source artifacts, ontology snapshot, configurable overview cards, featured terms, examples, and the raw artifact viewer.</p><p><strong>Customize:</strong> <code>site.hero</code>, <code>site.resourcePanel</code>, <code>site.overviewCards</code>, <code>site.customSections</code>, and <code>curation.featuredTerms</code>.</p></article>
          <article id="artifacts-summary" class="guide-card"><div class="term-badge">Source Package</div><h3><a href="#artifacts">Artifacts and Viewer</a></h3><p>OWL Ontology, SHACL, ShEx, specification, examples, and additional configured source files are copied into <code>site/assets/</code>. Config, schema, workflow, and guide files are available as generated links but are not raw-viewer tabs.</p><p><strong>Customize:</strong> <code>sources</code>, <code>features.rawViewer</code>, and <code>curation.viewerTabs</code>.</p></article>
          <article id="persistent-iri-summary" class="guide-card"><div class="term-badge">Linked Data Deployment</div><h3><a href="#persistent-iri">Persistent IRI</a></h3><p>Use w3id.org redirects plus static GitHub Pages assets to resolve browser term IRIs and content-negotiate full ontology representations.</p><p><strong>Customize:</strong> <code>persistentIri</code>.</p></article>
          <article id="reference-summary" class="guide-card"><div class="term-badge">Generated Page</div><h3><a href="#reference">Vocabulary Reference</a></h3><p>The reference page extracts declared terms from the configured ontology and groups them by class, property, concept, and declared-term type.</p><p><strong>Enable or disable:</strong> <code>features.referencePage</code>.</p></article>
          <article id="graph-summary" class="guide-card"><div class="term-badge">Interactive Page</div><h3><a href="#graph">Ontology Graph</a></h3><p>The Ontology Network supports <strong>Predicates as Nodes</strong> or <strong>Predicates as Edges</strong>, plus filters, search, selection, layout, and external-term visibility. Its full-screen view gives the network the full viewport and provides a collapsible controls drawer. WebVOWL can be enabled alongside it and expanded the same way.</p><p><strong>Customize:</strong> <code>graph.custom</code>, <code>graph.webvowl</code>, and <code>graph.colors</code>.</p></article>
          <article id="terms-summary" class="guide-card"><div class="term-badge">Generated Pages</div><h3><a href="#terms">Term Pages</a></h3><p>Every declared ontology term can receive an individual page with its IRI, labels, types, source links, and incoming/outgoing relationships.</p><p><strong>Enable or disable:</strong> <code>features.termPages</code>.</p></article>
          <article id="specification-summary" class="guide-card"><div class="term-badge">Optional Page</div><h3><a href="#specification">ReSpec Specification</a></h3><p>Place a ReSpec HTML document at <code>sources.spec</code>. OCG publishes it at <code>spec/index.html</code>, injects the companion navigation, and links it from the site.</p><p><strong>Enable or disable:</strong> <code>features.specPage</code>.</p></article>
          <article id="project-summary" class="guide-card"><div class="term-badge">Site Foundation</div><h3><a href="#project">Project Identity</a></h3><p>Project metadata supplies the shared title, namespace, version, and maintainer information used throughout the site.</p></article>
          <article id="usage-guide-summary" class="guide-card"><div class="term-badge">Optional Page</div><h3><a href="#usage-guide">Usage Guide</a></h3><p>The in-app guide can be enabled or disabled as a generated page and navigation destination.</p></article>
          <article id="branding-summary" class="guide-card"><div class="term-badge">Shared Styling</div><h3><a href="#branding">Theme and Footer</a></h3><p>Theme colors, fonts, footer copy, and OCG repository/documentation links are configured here.</p></article>
          <article id="styling-summary" class="guide-card"><div class="term-badge">Shared Styling</div><h3><a href="#styling">Component Styling</a></h3><p>Tune the corner radius scale and restyle buttons, cards, panels, badges, tabs, tables, code blocks, and callouts, or load a custom stylesheet.</p><p><strong>Customize:</strong> <code>theme.radius</code>, <code>theme.components</code>, and <code>theme.customCss</code>.</p></article>
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
  const preferredNamespacePrefix = ontologyInfo.ontology?.preferredNamespacePrefix || "";

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
              <h3><a href="${termPageHref(term, "terms/")}">${escapeHtml(term.qname)}</a></h3>
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
          ${
            preferredNamespacePrefix
              ? `
          <div class="meta-item--preferred-prefix">
            <dt>${escapeHtml(home.metadata.preferredNamespacePrefix)}</dt>
            <dd><code>${escapeHtml(preferredNamespacePrefix)}</code></dd>
          </div>`
              : ""
          }
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
    jsonLd: buildOntologyJsonLd(context),
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
              <td><a href="${termPageHref(node, "terms/")}"><code>${escapeHtml(node.qname)}</code></a></td>
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
    jsonLd: buildVocabularyJsonLd(context),
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
                  <label><input id="sigma-toggle-edge-labels" type="checkbox"${config.graph.custom.labels.edgeLabels ? " checked" : ""} /> Show predicate labels on edges</label>
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
  const graphThemeColors = {
    text: config.theme.colors.text,
    muted: config.theme.colors.mutedText,
    accentStrong: config.theme.colors.accentStrong,
    panel: config.theme.colors.panelBackground,
    border: config.theme.colors.border
  };
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
          const THEME_COLOR = ${JSON.stringify(graphThemeColors)};
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
          const edgeLabelToggleEl = document.getElementById("sigma-toggle-edge-labels");

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

          function colorToRgba(color, alpha) {
            const source = String(color || THEME_COLOR.border).trim();
            if (source.startsWith("#")) {
              const value = source.slice(1);
              const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
              const intValue = parseInt(expanded, 16);
              if (Number.isFinite(intValue)) {
                const r = (intValue >> 16) & 255;
                const g = (intValue >> 8) & 255;
                const b = intValue & 255;
                return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
              }
            }
            const rgb = source.match(/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)$/i);
            if (rgb) {
              return "rgba(" + rgb[1] + ", " + rgb[2] + ", " + rgb[3] + ", " + alpha + ")";
            }
            return source;
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
            return "<a href=\\\"terms/" + encodeURIComponent(node.pageName || node.localName || node.qname) + ".html\\\">" + text + "</a>";
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
              relations.map((relation) => "<span class=\\\"sigma-legend-chip\\\"><span class=\\\"sigma-line\\\" style=\\\"--line-color:" + (TYPE_COLOR[relation] || THEME_COLOR.muted) + ";\\\"><svg viewBox=\\\"0 0 28 10\\\" aria-hidden=\\\"true\\\"><path d=\\\"M1 5H20\\\" stroke=\\\"currentColor\\\" stroke-width=\\\"3.8\\\" stroke-linecap=\\\"round\\\"></path><path d=\\\"M20 1L27 5L20 9Z\\\" fill=\\\"currentColor\\\"></path></svg></span>" + escapeHtml(relationLabel(relation)) + "</span>").join("");
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
                labelColor: THEME_COLOR.text
              };
              const matchesQuery = !filters.searchTerm || attrs.qnameLower.includes(filters.searchTerm) || attrs.labelLower.includes(filters.searchTerm);
              if (!matchesQuery) {
                result.color = colorToRgba(attrs.baseColor, 0.2);
                result.labelColor = THEME_COLOR.muted;
              }
              if (selectedEdge) {
                if (!selectedEdgeEndpoints.has(node)) {
                  result.color = colorToRgba(attrs.baseColor, 0.15);
                  result.labelColor = THEME_COLOR.muted;
                } else {
                  result.size = attrs.baseSize * 1.18;
                  result.color = attrs.baseColor;
                  result.forceLabel = filters.showLabels;
                  result.labelColor = THEME_COLOR.accentStrong;
                }
                return result;
              }
              if (selectedNode) {
                if (!selectedNeighborhood.has(node)) {
                  result.color = colorToRgba(attrs.baseColor, 0.17);
                  result.labelColor = THEME_COLOR.muted;
                } else if (selectedNode === node) {
                  result.size = attrs.baseSize * 1.22;
                  result.color = attrs.baseColor;
                  result.forceLabel = filters.showLabels;
                  result.labelColor = THEME_COLOR.accentStrong;
                } else {
                  result.forceLabel = filters.showLabels;
                  result.labelColor = THEME_COLOR.text;
                }
              }
              return result;
            });
            renderer.setSetting("edgeReducer", (edge, attrs) => {
              if (!visibleEdges.has(edge)) {
                return { ...attrs, hidden: true };
              }
              // Sigma only draws an edge label when both endpoint labels happen to be
              // displayed, so forceLabel is what makes every visible predicate readable
              // without hovering it. This runs once per edge per refresh, so it reads the
              // cached toggle rather than rebuilding the whole filter state.
              const showEdgeLabels = edgeLabelToggleEl.checked;
              const result = {
                ...attrs,
                hidden: false,
                label: showEdgeLabels ? attrs.baseLabel : "",
                forceLabel: showEdgeLabels,
                labelColor: THEME_COLOR.muted
              };
              if (selectedEdge) {
                if (edge !== selectedEdge) {
                  result.color = colorToRgba(THEME_COLOR.muted, 0.16);
                  result.size = EDGE_DIM_SIZE;
                  result.label = "";
                  result.forceLabel = false;
                } else {
                  result.size = attrs.baseSize * 1.7;
                  result.color = attrs.baseColor;
                  result.labelColor = THEME_COLOR.accentStrong;
                  result.zIndex = 1;
                }
                return result;
              }
              if (selectedNode) {
                const adjacent = graph.source(edge) === selectedNode || graph.target(edge) === selectedNode;
                if (!adjacent) {
                  result.color = colorToRgba(THEME_COLOR.muted, 0.16);
                  result.size = EDGE_DIM_SIZE;
                  result.label = "";
                  result.forceLabel = false;
                } else {
                  result.size = attrs.baseSize * 1.25;
                  result.labelColor = THEME_COLOR.text;
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
            document.getElementById("sigma-toggle-edge-labels").addEventListener("change", () => renderer.refresh());
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
            context.strokeStyle = colorToRgba(THEME_COLOR.panel, 0.96);
            context.lineWidth = 3.5;
            context.strokeText(data.label, x, y);
            context.fillStyle = data.labelColor || THEME_COLOR.text;
            context.fillText(data.label, x, y);
            context.restore();
          }

          function drawReadableEdgeLabel(context, edgeData, sourceData, targetData, settings) {
            const label = edgeData.label;
            if (!label) return;
            const size = settings.edgeLabelSize;
            const dx = targetData.x - sourceData.x;
            const dy = targetData.y - sourceData.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < sourceData.size + targetData.size) return;
            context.save();
            context.font = settings.edgeLabelWeight + " " + size + "px " + settings.edgeLabelFont;
            const available = distance - sourceData.size - targetData.size - 8;
            const textWidth = context.measureText(label).width;
            // Skip rather than ellipsize: a truncated prefixed IRI is worse than none,
            // and the edge tooltip still carries the full value.
            if (textWidth > available) {
              context.restore();
              return;
            }
            const centerX = (sourceData.x + targetData.x) / 2;
            const centerY = (sourceData.y + targetData.y) / 2;
            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
              angle += Math.PI;
            }
            context.translate(centerX, centerY);
            context.rotate(angle);
            context.textAlign = "center";
            context.textBaseline = "alphabetic";
            context.lineJoin = "round";
            context.miterLimit = 2;
            context.strokeStyle = colorToRgba(THEME_COLOR.panel, 0.96);
            context.lineWidth = 3.5;
            context.strokeText(label, 0, -edgeData.size / 2 - 3);
            context.fillStyle = edgeData.labelColor || THEME_COLOR.muted;
            context.fillText(label, 0, -edgeData.size / 2 - 3);
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
                labelColor: THEME_COLOR.text,
                forceLabel: forceAllLabels || priorityNodeIds.has(node.id),
                baseForceLabel: forceAllLabels || priorityNodeIds.has(node.id),
                color,
                baseColor: color,
                termType: node.termType,
                isExternal: node.isExternal
              });
            });
            graphData.edges.forEach((edge, index) => {
              const color = TYPE_COLOR[edge.relation] || THEME_COLOR.muted;
              const id = edge.id || "rel-" + String(index + 1).padStart(3, "0");
              const edgeLabel = edge.predicateQname || edge.label || edge.relation;
              graph.addDirectedEdgeWithKey(id, edge.source, edge.target, { type: "arrow", color, baseColor: color, size: EDGE_BASE_SIZE, baseSize: EDGE_BASE_SIZE, relation: edge.relation, label: edgeLabel, baseLabel: edgeLabel, labelColor: THEME_COLOR.muted });
            });
            renderer = new SigmaCtor(graph, container, {
              defaultEdgeType: "arrow",
              renderEdgeLabels: true,
              edgeLabelFont: LABEL_FONT,
              edgeLabelSize: LABEL_SETTINGS.edgeLabelSize,
              edgeLabelWeight: "500",
              edgeLabelColor: { attribute: "labelColor", color: THEME_COLOR.muted },
              edgeLabelRenderer: drawReadableEdgeLabel,
              renderLabels: true,
              labelDensity: LABEL_SETTINGS.density,
              labelGridCellSize: LABEL_SETTINGS.gridCellSize,
              labelRenderedSizeThreshold: LABEL_SETTINGS.renderedSizeThreshold,
              labelFont: LABEL_FONT,
              labelSize: 13,
              labelWeight: "500",
              labelColor: { attribute: "labelColor", color: THEME_COLOR.text },
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

// ---------------------------------------------------------------------------
// Embedded JSON-LD
//
// Term pages carry the triples OCG parsed for that term, so a crawler that
// fetches the HTML gets machine-readable RDF without content negotiation. The
// emitted graph is a faithful subset of the source: the predicate that actually
// produced a label or comment is re-used, and language tags are preserved. The
// one statement OCG adds of its own is rdfs:isDefinedBy, linking a term to the
// ontology IRI it was declared in.
// ---------------------------------------------------------------------------

function jsonLdContext(ontologyInfo) {
  const context = { ...JSON_LD_BASE_CONTEXT };
  for (const { prefix, base } of ontologyInfo.prefixes || []) {
    // A prefix from the ontology must not silently redefine a well-known one.
    if (!context[prefix]) {
      context[prefix] = base;
    }
  }
  return context;
}

function jsonLdLiteral(entry) {
  if (!entry?.value) {
    return null;
  }
  return entry.language ? { "@value": entry.value, "@language": entry.language } : entry.value;
}

function jsonLdScript(document) {
  // "</script>" inside the payload would close the element early; escaping "<"
  // keeps the JSON equivalent and the element intact.
  const serialized = JSON.stringify(document, null, 2).replaceAll("<", "\\u003C");
  return `<script type="application/ld+json">${serialized}</script>`;
}

function buildTermJsonLdNode(context, node) {
  const { ontologyInfo } = context;
  const document = { "@id": node.uri };
  if (node.types?.length) {
    document["@type"] = node.types.length === 1 ? node.types[0] : [...node.types];
  }

  const label = jsonLdLiteral(
    node.labelPredicate ? { value: node.label, language: node.labelLanguage } : null
  );
  if (label) {
    document[uriToQnameOrIri(node.labelPredicate, ontologyInfo.prefixes)] = label;
  }
  const comment = jsonLdLiteral(
    node.commentPredicate ? { value: node.comment, language: node.commentLanguage } : null
  );
  if (comment) {
    document[uriToQnameOrIri(node.commentPredicate, ontologyInfo.prefixes)] = comment;
  }

  for (const edge of ontologyInfo.edges.filter((entry) => entry.source === node.id)) {
    const predicateIri = predicateIriForRelation(edge.relation);
    if (!predicateIri) {
      continue;
    }
    const key = uriToQnameOrIri(predicateIri, ontologyInfo.prefixes);
    const value = { "@id": edge.target };
    if (!document[key]) {
      document[key] = value;
    } else if (Array.isArray(document[key])) {
      document[key].push(value);
    } else {
      document[key] = [document[key], value];
    }
  }

  if (ontologyInfo.ontology?.iri) {
    document["rdfs:isDefinedBy"] = { "@id": ontologyInfo.ontology.iri };
  }
  return document;
}

function buildOntologyJsonLdNode(context) {
  const { ontologyInfo } = context;
  const ontology = ontologyInfo.ontology || {};
  if (!ontology.iri) {
    return null;
  }
  const document = { "@id": ontology.iri, "@type": "owl:Ontology" };
  const label = jsonLdLiteral(ontology.label);
  if (label) {
    document[uriToQnameOrIri(ontology.label.predicate, ontologyInfo.prefixes)] = label;
  }
  const comment = jsonLdLiteral(ontology.comment);
  if (comment) {
    document[uriToQnameOrIri(ontology.comment.predicate, ontologyInfo.prefixes)] = comment;
  }
  if (ontology.preferredNamespacePrefix) {
    document["vann:preferredNamespacePrefix"] = ontology.preferredNamespacePrefix;
  }
  if (ontology.preferredNamespaceUri) {
    document["vann:preferredNamespaceUri"] = ontology.preferredNamespaceUri;
  }
  return document;
}

function buildTermJsonLd(context, node) {
  if (!context.config.features.embeddedJsonLd) {
    return "";
  }
  return jsonLdScript({
    "@context": jsonLdContext(context.ontologyInfo),
    ...buildTermJsonLdNode(context, node)
  });
}

function buildOntologyJsonLd(context) {
  if (!context.config.features.embeddedJsonLd) {
    return "";
  }
  const ontology = buildOntologyJsonLdNode(context);
  return ontology ? jsonLdScript({ "@context": jsonLdContext(context.ontologyInfo), ...ontology }) : "";
}

// The reference page shows the whole vocabulary, so it carries the whole graph:
// one fetch gives a crawler every declared term.
function buildVocabularyJsonLd(context) {
  if (!context.config.features.embeddedJsonLd) {
    return "";
  }
  const { ontologyInfo } = context;
  const graph = [
    buildOntologyJsonLdNode(context),
    ...ontologyInfo.nodes
      .filter((node) => !node.isExternal)
      .map((node) => buildTermJsonLdNode(context, node))
  ].filter(Boolean);
  if (!graph.length) {
    return "";
  }
  return jsonLdScript({ "@context": jsonLdContext(ontologyInfo), "@graph": graph });
}

function buildPitfallPage(context) {
  const { config, ontologyInfo, pitfallReport } = context;
  const nodeByUri = new Map(ontologyInfo.nodes.map((node) => [node.uri, node]));
  const importanceLabel = (level) => (OOPS_IMPORTANCE_ORDER.includes(level) ? level : "Minor");

  const renderElement = (uri) => {
    const node = nodeByUri.get(uri);
    const href = config.features.termPages ? termPageHref(node, "terms/") : null;
    const text = escapeHtml(node?.qname || uriToQnameOrIri(uri, ontologyInfo.prefixes || []));
    return href
      ? `<li><a href="${href}"><code>${text}</code></a></li>`
      : `<li><code>${text}</code></li>`;
  };

  const summaryCards = OOPS_IMPORTANCE_ORDER.map((level) => `
        <div class="metric-card pitfall-metric pitfall-metric--${level.toLowerCase()}">
          <div class="metric-number">${pitfallReport.summary.byImportance?.[level] || 0}</div>
          <div class="metric-label">${escapeHtml(level)}</div>
        </div>
      `).join("");

  const pitfallCards = pitfallReport.pitfalls
    .map((pitfall) => `
        <article class="card pitfall-card pitfall-card--${importanceLabel(pitfall.importanceLevel).toLowerCase()}">
          <div class="pitfall-card-head">
            <code class="pitfall-code">${escapeHtml(pitfall.code)}</code>
            <span class="pitfall-importance">${escapeHtml(importanceLabel(pitfall.importanceLevel))}</span>
          </div>
          <h3>${escapeHtml(pitfall.name)}</h3>
          <p>${escapeHtml(pitfall.description)}</p>
          ${
            pitfall.affectedElements.length
              ? `<details class="pitfall-elements"><summary>${pitfall.numberAffectedElements} affected element${pitfall.numberAffectedElements === 1 ? "" : "s"}</summary><ul>${pitfall.affectedElements.map(renderElement).join("")}</ul></details>`
              : `<p class="pitfall-scope">Reported for the ontology as a whole.</p>`
          }
          <a class="pitfall-reference" href="https://oops.linkeddata.es/catalogue.jsp" target="_blank" rel="noreferrer">Pitfall catalogue</a>
        </article>
      `)
    .join("");

  const status = pitfallReport.available
    ? `<p class="section-note">Scanned ${escapeHtml(pitfallReport.scannedAt.slice(0, 10))} against <a href="${escapeHtml(pitfallReport.serviceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(pitfallReport.serviceUrl)}</a>${pitfallReport.fromCache ? " (cached report)" : ""}.</p>`
    : `<div class="pitfall-unavailable"><strong>Report unavailable.</strong> ${escapeHtml(pitfallReport.error || "The OOPS! scan did not complete.")} Re-run <code>npm run ocg:build</code> once the service is reachable.</div>`;

  const content = `
    <section id="pitfall-overview" class="section">
      <div class="section-head">
        <div class="section-heading-row">
          <h2>Ontology Pitfalls</h2>
          ${howToLink(config, "pitfalls")}
        </div>
        <p class="section-note">Modelling pitfalls detected in <code>${escapeHtml(config.sources.ontology)}</code> by OOPS! (OntOlogy Pitfall Scanner!). Pitfalls are advisory: each one is a candidate improvement, not a validation error.</p>
        ${status}
      </div>
      ${
        pitfallReport.available
          ? `<div class="metrics-grid" style="--metric-count: 4">
        <div class="metric-card"><div class="metric-number">${pitfallReport.summary.total}</div><div class="metric-label">Pitfalls</div></div>
        ${summaryCards}
      </div>`
          : ""
      }
    </section>

    ${
      pitfallReport.available
        ? `<section id="pitfall-details" class="section">
      <div class="section-head">
        <h2>Detected Pitfalls</h2>
        <p class="section-note">${pitfallReport.summary.total ? `${pitfallReport.summary.total} pitfall${pitfallReport.summary.total === 1 ? "" : "s"} across ${pitfallReport.summary.affectedElements} distinct ontology element${pitfallReport.summary.affectedElements === 1 ? "" : "s"}.` : "OOPS! reported no pitfalls for this ontology."}</p>
      </div>
      ${pitfallCards ? `<div class="card-grid pitfall-grid">${pitfallCards}</div>` : ""}
    </section>`
        : ""
    }

    <section id="pitfall-attribution" class="section">
      <div class="section-head">
        <h2>About This Report</h2>
        <p class="section-note">OOPS! is an independent web service maintained by the Ontology Engineering Group. OCG only submits the configured ontology and renders the returned report; disable <code>pitfallScanner.enabled</code> to keep builds fully offline.</p>
      </div>
      <p>Poveda-Villalon, M., Gomez-Perez, A., Suarez-Figueroa, M. C. (2014). OOPS! (OntOlogy Pitfall Scanner!): An On-line Tool for Ontology Evaluation. <em>International Journal on Semantic Web and Information Systems</em>, 10(2), 7-34. <a href="https://oops.linkeddata.es" target="_blank" rel="noreferrer">oops.linkeddata.es</a></p>
    </section>
  `;

  return renderPage({
    config,
    title: `${config.project.shortName} Pitfalls`,
    description: `OOPS! pitfall report for ${config.project.title}.`,
    currentNav: "pitfalls",
    bodyClass: "page-pitfalls",
    content,
    pageToc: [
      { id: "pitfall-overview", label: "Overview" },
      ...(pitfallReport.available ? [{ id: "pitfall-details", label: "Detected Pitfalls" }] : []),
      { id: "pitfall-attribution", label: "About This Report" }
    ]
  });
}

function buildTermsIndexPage(context, declaredNodes) {
  const { config } = context;
  const rowsFor = (nodes) => nodes
    .map((node) => `
        <tr>
          <td><a href="${termPageHref(node)}"><code>${escapeHtml(node.qname)}</code></a></td>
          <td>${escapeHtml(TERM_TYPE_INFO[node.termType].label)}</td>
          <td>${escapeHtml(node.label)}</td>
          <td>${escapeHtml(node.comment || "-")}</td>
        </tr>
      `)
    .join("");
  const typeSections = TERM_TYPE_ORDER
    .filter((type) => type !== "external")
    .map((type) => ({ type, nodes: declaredNodes.filter((node) => node.termType === type) }))
    .filter(({ nodes }) => nodes.length)
    .map(({ type, nodes }) => ({
      id: `terms-${type}`,
      label: pluralTermTypeLabel(type),
      content: `
        <section id="terms-${type}" class="section">
          <div class="section-head">
            <h2>${escapeHtml(pluralTermTypeLabel(type))}</h2>
            <p class="section-note">${nodes.length} declared ${escapeHtml(pluralTermTypeLabel(type).toLowerCase())} in the configured ontology.</p>
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
              <tbody>${rowsFor(nodes)}</tbody>
            </table>
          </div>
        </section>
      `
    }));

  return renderPage({
    config,
    title: `${config.project.title} Terms`,
    description: `Per-term pages for ${config.project.title}.`,
    currentNav: "terms",
    pathPrefix: "../",
    pageToc: [
      { id: "terms-index", label: "Overview" },
      ...typeSections.map(({ id, label }) => ({ id, label }))
    ],
    content: `
      <section id="terms-index" class="section">
        <div class="section-head">
          <div class="section-heading-row">
            <h1>Term Pages</h1>
            ${howToLink(config, "terms", "../")}
          </div>
          <p class="section-note">Every declared ontology term gets its own generated HTML page when <code>features.termPages</code> is enabled.</p>
        </div>
      </section>
      ${typeSections.map(({ content }) => content).join("")}
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
            const href = termPageHref(related);
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
    jsonLd: buildTermJsonLd(context, node),
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
  const collapseLabel = escapeHtml(config.site.toc.collapseLabel);
  return `
    <aside class="page-toc" aria-label="${title}">
      <div class="page-toc-panel">
        <div class="page-toc-head">
          <span class="page-toc-title">${title}</span>
          <button class="page-toc-toggle" type="button" data-page-toc-toggle aria-controls="page-toc-links" aria-expanded="true" aria-label="${collapseLabel}" title="${collapseLabel}">
            <svg class="page-toc-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"></path></svg>
          </button>
        </div>
        <nav id="page-toc-links" aria-label="${title}">
          <ol>
            ${tocItems
              .map(
                (item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.label)}</a></li>`
              )
              .join("")}
          </ol>
        </nav>
      </div>
    </aside>
    <script>
      (() => {
        const pageToc = document.querySelector(".page-toc");
        const pageTocToggle = pageToc?.querySelector("[data-page-toc-toggle]");
        const pageLayout = pageToc?.closest(".page-content-layout");
        if (!pageTocToggle || !pageLayout) return;

        const collapseLabel = ${JSON.stringify(config.site.toc.collapseLabel)};
        const expandLabel = ${JSON.stringify(config.site.toc.expandLabel)};
        function setPageTocCollapsed(collapsed) {
          pageToc.classList.toggle("is-collapsed", collapsed);
          pageLayout.classList.toggle("page-content-layout--toc-collapsed", collapsed);
          pageTocToggle.setAttribute("aria-expanded", String(!collapsed));
          pageTocToggle.setAttribute("aria-label", collapsed ? expandLabel : collapseLabel);
          pageTocToggle.title = collapsed ? expandLabel : collapseLabel;
        }

        pageTocToggle.addEventListener("click", () => {
          setPageTocCollapsed(!pageToc.classList.contains("is-collapsed"));
        });
      })();
    </script>`;
}

function buildPersistentIriResolverPage(context) {
  const { config, ontologyInfo, persistentIri } = context;
  const termTargets = Object.fromEntries(
    ontologyInfo.nodes
      .filter((node) => !node.isExternal && node.localName)
      .map((node) => [node.localName, termPageHref(node, "terms/")])
  );
  const serializedTargets = JSON.stringify(termTargets).replaceAll("<", "\\u003c");
  const fallbackTarget = persistentIri.referenceTarget;

  return renderPage({
    config,
    title: `${config.project.shortName} IRI Resolver`,
    description: `Resolves persistent term IRIs for ${config.project.title}.`,
    currentNav: "",
    content: `
      <section class="section resolver-section">
        <div class="section-head">
          <div class="eyebrow">Persistent IRI</div>
          <h1>Resolving ontology IRI</h1>
          <p id="iri-resolver-status" class="section-note" role="status">Routing this persistent IRI to its companion-site page.</p>
        </div>
        <div id="iri-resolver-error" class="guide-callout" hidden>
          <strong>Term page not found.</strong>
          <span id="iri-resolver-error-copy"></span>
          <a href="${escapeHtml(fallbackTarget)}">Browse the ontology reference</a>.
        </div>
        <noscript><div class="guide-callout"><strong>JavaScript is required for hash-based term IRIs.</strong> Open the ontology reference to browse generated term pages.</div></noscript>
      </section>
      <script>
        (() => {
          const TERM_TARGETS = ${serializedTargets};
          const FALLBACK_TARGET = ${JSON.stringify(fallbackTarget)};
          const status = document.getElementById("iri-resolver-status");
          const error = document.getElementById("iri-resolver-error");
          const errorCopy = document.getElementById("iri-resolver-error-copy");
          const fragment = window.location.hash.slice(1);

          if (!fragment) {
            window.location.replace(FALLBACK_TARGET);
            return;
          }

          let localName;
          try {
            localName = decodeURIComponent(fragment);
          } catch {
            localName = "";
          }
          const target = TERM_TARGETS[localName];
          if (target) {
            window.location.replace(target);
            return;
          }

          status.textContent = "No generated term page matches this IRI fragment.";
          error.hidden = false;
          errorCopy.textContent = localName
            ? " No generated term page is available for '" + localName + "'."
            : " The IRI fragment could not be read.";
        })();
      </script>
    `
  });
}

function buildPersistentIriLinkTags(config) {
  const persistentIri = config._persistentIri;
  if (!persistentIri?.enabled) {
    return "";
  }
  return persistentIri.representations
    .map(
      (representation) => `<link rel="alternate" type="${escapeHtml(representation.mediaType)}" href="${escapeHtml(representation.url)}" />`
    )
    .join("\n  ");
}

function renderPage({ config, title, description, currentNav, content, bodyClass = "", pathPrefix = "", pageToc = [], jsonLd = "" }) {
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
  ${buildFaviconLinks(config, pathPrefix)}
  ${buildPersistentIriLinkTags(config)}
  ${jsonLd}
  ${buildFontLinks(config)}
  ${buildStylesheetLinks(config, pathPrefix, "main")}
</head>
<body class="${escapeHtml(pageBodyClass)}">
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="${pathPrefix}index.html">
        ${buildBrandMark(config, pathPrefix)}
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
    config.pitfallScanner.enabled ? { key: "pitfalls", href: `${pathPrefix}ontology-pitfalls.html`, label: "Pitfalls" } : null,
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

// Writes the bundled stylesheets and returns their cache-busted, site-relative URLs.
function writeStylesheets(config) {
  const stylesheets = {};
  const write = (sheet, fileName, css) => {
    writeText(path.join(STYLE_ASSETS_DIR, fileName), css);
    stylesheets[sheet] = `assets/css/${fileName}?v=${contentHash(css)}`;
  };
  write("main", "ocg.css", buildStylesheet(config));
  if (config.features.specPage) {
    write("spec", "ocg-spec.css", buildSpecStylesheet(config));
  }
  if (config.theme.customCss) {
    write("custom", "custom.css", fs.readFileSync(resolveProjectPath(config.theme.customCss), "utf8"));
  }
  return stylesheets;
}

function buildStylesheet(config) {
  const layerNames = [...STYLESHEET_LAYERS.map(([layer]) => `ocg.${layer}`), "ocg.theme"];
  const layers = STYLESHEET_LAYERS.map(([layer, files]) => {
    const sources = files.map(readStyleTemplate);
    if (layer === "tokens") {
      sources.unshift(buildThemeTokenCss(config));
    }
    return `@layer ocg.${layer} {\n${sources.join("\n\n")}\n}`;
  });
  const componentTokens = resolveThemeComponentTokens(config.theme.components);
  if (componentTokens.length) {
    layers.push(`@layer ocg.theme {\n${cssRule(":root", componentTokens)}\n}`);
  }
  return [stylesheetBanner(), `@layer ${layerNames.join(", ")};`, ...layers].join("\n\n") + "\n";
}

function buildSpecStylesheet(config) {
  const componentTokens = resolveThemeComponentTokens(config.theme.components);
  return [
    stylesheetBanner(),
    buildThemeTokenCss(config),
    readStyleTemplate("tokens.css"),
    componentTokens.length ? cssRule(":root", componentTokens) : "",
    ...SPEC_STYLESHEET_FILES.map((file) => scopeCss(readStyleTemplate(file), SPEC_STYLE_SCOPE))
  ]
    .filter(Boolean)
    .join("\n\n") + "\n";
}

function stylesheetBanner() {
  return `/* Generated by OCG v${OCG_VERSION} from templates/styles and the ocg.config.json theme. Change those sources instead of this file. */`;
}

function buildThemeTokenCss(config) {
  const { colors, fonts, radius } = config.theme;
  return cssRule(":root", [
    ...Object.entries(THEME_COLOR_TOKENS).map(([name, property]) => [property, colors[name]]),
    ["--ocg-font-heading", cssFontFamily(fonts.heading, "sans-serif")],
    ["--ocg-font-body", cssFontFamily(fonts.body, "sans-serif")],
    ["--ocg-font-mono", cssFontFamily(fonts.mono, "monospace")],
    ...Object.entries(radius).map(([step, value]) => [
      `--ocg-radius-${step}`,
      normalizeThemeValue("length", value, `theme.radius.${step}`)
    ])
  ]);
}

function cssRule(selector, declarations) {
  return `${selector} {\n${declarations.map(([property, value]) => `  ${property}: ${value};`).join("\n")}\n}`;
}

function readStyleTemplate(file) {
  return fs.readFileSync(path.join(STYLE_TEMPLATES_DIR, file), "utf8").trim();
}

// Prefixes each selector except :root with `scope` so the rules outrank a host
// document's own styles. Supports the flat rules and @media blocks used by the
// style templates.
function scopeCss(css, scope) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("{", index);
    if (open === -1) break;
    const prelude = source.slice(index, open).trim();
    if (prelude.startsWith("@")) {
      const close = findClosingBrace(source, open);
      rules.push(`${prelude} {\n${scopeCss(source.slice(open + 1, close), scope)}\n}`);
      index = close + 1;
      continue;
    }
    const close = source.indexOf("}", open);
    const selectors = splitSelectorList(prelude).map((selector) =>
      selector === ":root" || selector.startsWith(scope) ? selector : `${scope} ${selector}`
    );
    rules.push(`${selectors.join(",\n")} {${source.slice(open + 1, close).replace(/\s+$/, "\n")}}`);
    index = close + 1;
  }
  return rules.join("\n");
}

function findClosingBrace(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return index;
  }
  throw new Error("Unbalanced braces in a style template");
}

function splitSelectorList(prelude) {
  const selectors = [];
  let depth = 0;
  let current = "";
  for (const character of prelude) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      selectors.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  selectors.push(current.trim());
  return selectors.filter(Boolean);
}

function buildStylesheetLinks(config, pathPrefix, sheet) {
  return [config._stylesheets?.[sheet], config._stylesheets?.custom]
    .filter(Boolean)
    .map((href) => `<link rel="stylesheet" href="${pathPrefix}${escapeHtml(href)}" />`)
    .join("\n  ");
}

// Requests each distinct Google Fonts family once with the weights its roles use.
// Generic families such as system-ui are left to the browser.
function buildFontLinks(config) {
  const families = new Map();
  for (const [role, weights] of Object.entries(FONT_WEIGHTS)) {
    const family = config.theme.fonts[role].trim();
    if (isGenericFontFamily(family)) continue;
    const familyWeights = families.get(family) || new Set();
    weights.forEach((weight) => familyWeights.add(weight));
    families.set(family, familyWeights);
  }
  if (!families.size) {
    return "";
  }
  const query = Array.from(
    families,
    ([family, weights]) => `family=${encodeFontQuery(family)}:wght@${Array.from(weights).sort((a, b) => a - b).join(";")}`
  ).join("&");
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
    `<link href="${escapeHtml(`https://fonts.googleapis.com/css2?${query}&display=swap`)}" rel="stylesheet" />`
  ].join("\n  ");
}

function cssFontFamily(name, fallback) {
  const family = name.trim();
  return isGenericFontFamily(family) ? `${family}, ${fallback}` : `"${family}", ${fallback}`;
}

function isGenericFontFamily(name) {
  return GENERIC_FONT_FAMILIES.has(name.trim().toLowerCase());
}

function contentHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
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

function termPageBaseName(node) {
  const candidate = String(node.localName || "").replaceAll(/[\\/\u0000]+/g, "_").trim();
  if (candidate && !/^\.+$/.test(candidate)) {
    return candidate;
  }
  const fallback = sanitizeFileName(String(node.qname || node.uri || ""));
  return fallback && !/^\.+$/.test(fallback) ? fallback : "term";
}

// Term pages live next to the generated terms/index.html listing, so a term whose
// local name is "index" (or a name that only differs from another term by case on
// a case-insensitive file system) would silently overwrite an existing page.
function assignTermPageNames(nodes) {
  const taken = new Set();
  for (const node of nodes) {
    if (node.isExternal) {
      node.pageName = null;
      continue;
    }
    const base = termPageBaseName(node);
    let candidate = RESERVED_TERM_PAGE_NAMES.has(base.toLowerCase()) ? `${base}-term` : base;
    let suffix = 2;
    while (taken.has(termPageKey(candidate))) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(termPageKey(candidate));
    node.pageName = candidate;
  }
}

function termPageKey(value) {
  return encodeURIComponent(value).toLowerCase();
}

function termPageHref(node, pathPrefix = "") {
  if (!node || node.isExternal) {
    return null;
  }
  return `${pathPrefix}${encodeURIComponent(node.pageName || termPageBaseName(node))}.html`;
}

function getBrandingAsset(sourceFile, kind) {
  if (!sourceFile) return null;
  const extension = path.extname(sourceFile).toLowerCase();
  const fileName = kind === "favicon"
    ? `favicon${extension}`
    : `header-image${extension}`;
  return {
    sourcePath: resolveProjectPath(sourceFile),
    fileName,
    publicPath: kind === "favicon" ? fileName : `assets/branding/${fileName}`,
    extension
  };
}

function buildBrandMark(config, pathPrefix = "", className = "brand-mark") {
  const headerImage = getBrandingAsset(config.site.branding.headerImage, "headerImage");
  if (!headerImage) {
    return `<span class="${className}">${escapeHtml(config.project.shortName)}</span>`;
  }
  const alt = `${config.project.shortName} logo`;
  return `<span class="${className} ${className}--image"><img src="${pathPrefix}${headerImage.publicPath}" alt="${escapeHtml(alt)}" /></span>`;
}

function buildFaviconLinks(config, pathPrefix = "") {
  const favicon = getBrandingAsset(config.site.branding.favicon, "favicon");
  if (!favicon) {
    return `<link rel="icon" href="${pathPrefix}favicon.ico" sizes="any" />\n  <link rel="icon" type="image/png" sizes="512x512" href="${pathPrefix}favicon.png" />`;
  }
  const type = FAVICON_MIME_TYPES[favicon.extension];
  const sizes = favicon.extension === ".png" ? ' sizes="512x512"' : favicon.extension === ".ico" ? ' sizes="any"' : "";
  return `<link rel="icon" type="${type}"${sizes} href="${pathPrefix}${favicon.publicPath}" />`;
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
