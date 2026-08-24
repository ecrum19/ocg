#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, "ocg.config.json");
const SCHEMA_PATH = path.join(PROJECT_ROOT, "ocg.config.schema.json");
const WORKFLOW_PATH = path.join(PROJECT_ROOT, ".github", "workflows", "publish-pages.yml");

const DEFAULT_CONFIG = {
  "$schema": "./ocg.config.schema.json",
  project: {
    title: "{{TITLE}}",
    shortName: "{{SHORT_NAME}}",
    slug: "{{SLUG}}",
    description: "A companion site for the {{TITLE}} ontology.",
    namespace: "{{NAMESPACE}}",
    canonicalUri: "{{CANONICAL_URI}}",
    version: PACKAGE_JSON.version,
    maintainer: ""
  },
  sources: {
    ontology: "{{ONTOLOGY}}",
    ontologyFormat: "auto",
    shapes: "{{SHAPES}}",
    shex: "{{SHEX}}",
    spec: "{{SPEC}}",
    examples: [],
    artifacts: []
  },
  features: {
    referencePage: true,
    graphPage: true,
    termPages: true,
    rawViewer: true,
    overviewCards: true,
    hierarchyAsset: true,
    hierarchyOverview: false,
    specPage: false,
    usageGuidePage: true
  },
  hierarchy: {
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
      kicker: "Ontology Companion",
      headline: "A companion site for your ontology.",
      body: "Edit this configuration to customize the generated reference, graph, terms, artifacts, and documentation pages."
    },
    resourcePanel: {
      title: "Published Artifacts",
      body: "Generated outputs from the configured ontology source package."
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
    footer: { primary: "", secondary: "" },
    generator: {
      repositoryUrl: "https://github.com/ecrum19/ocg",
      documentationUrl: "https://github.com/ecrum19/ocg#readme"
    }
  },
  curation: {
    featuredTerms: [],
    autoFeaturedTerms: true,
    featuredTermLimit: 6,
    viewerTabs: []
  }
};

main().catch((error) => {
  console.error(`ocg: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    printHelp();
    return;
  }
  if (["version", "--version", "-v"].includes(command)) {
    console.log(PACKAGE_JSON.version);
    return;
  }

  if (command === "init") {
    initProject(args);
    return;
  }
  if (["build", "check", "clean"].includes(command)) {
    runGenerator(command, args);
    return;
  }
  if (command === "dev") {
    const status = runGenerator("build", args);
    if (status !== 0) return;
    await serveSite(args);
    return;
  }

  throw new Error(`Unknown command '${command}'. Run 'ocg --help' for usage.`);
}

function runGenerator(command, args) {
  const scriptPath = path.join(PACKAGE_ROOT, "scripts", "build-site.mjs");
  const forwarded = [scriptPath, "--project-root", PROJECT_ROOT];
  for (const option of ["--config", "--output"]) {
    const value = getOption(args, option);
    if (value) forwarded.push(option, value);
  }
  if (command === "clean") forwarded.push("--clean");
  if (command === "check") forwarded.push("--check");

  const result = spawnSync(process.execPath, forwarded, { stdio: "inherit" });
  if (result.error) throw result.error;
  const status = result.status || 0;
  if (status !== 0) process.exitCode = status;
  return status;
}

function initProject(args) {
  const force = args.includes("--force");
  const ontologyInput = getOption(args, "--ontology") || detectOntology();
  if (!ontologyInput) {
    throw new Error("No ontology source found. Pass --ontology path/to/ontology.ttl.");
  }

  const ontologyPath = resolveProjectPath(ontologyInput);
  if (!fs.existsSync(ontologyPath)) {
    throw new Error(`Ontology source does not exist: ${path.relative(PROJECT_ROOT, ontologyPath)}`);
  }
  if (fs.existsSync(CONFIG_PATH) && !force) {
    throw new Error("ocg.config.json already exists. Use --force only if you want to replace it.");
  }

  const stem = path.basename(ontologyPath, path.extname(ontologyPath));
  const slug = slugify(stem);
  const title = humanize(stem);
  const inferredNamespace = inferNamespace(ontologyPath);
  const namespace = inferredNamespace || `https://example.org/${slug}#`;
  const config = buildInitialConfig({
    title,
    slug,
    shortName: shortName(title),
    namespace,
    ontology: relativeProjectPath(ontologyPath),
    shapes: detectSibling("shapes", [".ttl", ".rdf", ".jsonld"]),
    shex: detectSibling("shex", [".shex"]),
    spec: detectExisting(["spec/index.html", "source/spec/index.html"])
  });

  writeJson(CONFIG_PATH, config);
  copyIfMissing(path.join(PACKAGE_ROOT, "ocg.config.schema.json"), SCHEMA_PATH);
  copyIfMissing(path.join(PACKAGE_ROOT, "templates", "publish-pages.yml"), WORKFLOW_PATH);
  updatePackageManifest(slug);

  console.log(`Created ${path.relative(PROJECT_ROOT, CONFIG_PATH)}.`);
  console.log("Review the generated project metadata, namespace, and source paths before building.");
  if (!inferredNamespace) {
    console.log("Warning: no namespace declaration was detected; replace the example namespace in ocg.config.json.");
  }
  console.log("Run npm install, then npm run ocg:check and npm run ocg:build.");
}

function buildInitialConfig(values) {
  const replace = (value) => value
    .replaceAll("{{TITLE}}", values.title)
    .replaceAll("{{SHORT_NAME}}", values.shortName)
    .replaceAll("{{SLUG}}", values.slug)
    .replaceAll("{{NAMESPACE}}", values.namespace)
    .replaceAll("{{CANONICAL_URI}}", values.namespace.replace(/[#/]$/, ""))
    .replaceAll("{{ONTOLOGY}}", values.ontology)
    .replaceAll("{{SHAPES}}", values.shapes || "")
    .replaceAll("{{SHEX}}", values.shex || "")
    .replaceAll("{{SPEC}}", values.spec || "");
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG, (_, value) => value));
  const serialized = replace(JSON.stringify(config));
  const result = JSON.parse(serialized);
  if (values.spec) result.features.specPage = true;
  if (!values.shapes) delete result.sources.shapes;
  if (!values.shex) delete result.sources.shex;
  if (!values.spec) delete result.sources.spec;
  return result;
}

function updatePackageManifest(slug) {
  const packagePath = path.join(PROJECT_ROOT, "package.json");
  const packageJson = fs.existsSync(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, "utf8"))
    : {
        name: slug,
        version: PACKAGE_JSON.version,
        private: true,
        type: "module",
        scripts: {},
        devDependencies: {}
      };
  packageJson.devDependencies = {
    ...(packageJson.devDependencies || {}),
    [PACKAGE_JSON.name]: `^${PACKAGE_JSON.version}`
  };
  packageJson.scripts = {
    ...(packageJson.scripts || {}),
    "ocg:build": packageJson.scripts?.["ocg:build"] || "ocg build",
    "ocg:check": packageJson.scripts?.["ocg:check"] || "ocg check",
    "ocg:clean": packageJson.scripts?.["ocg:clean"] || "ocg clean",
    "ocg:dev": packageJson.scripts?.["ocg:dev"] || "ocg dev"
  };
  writeJson(packagePath, packageJson);
}

function detectOntology() {
  const candidates = [
    "ontology.ttl",
    "vocab.ttl",
    "source/ontology/ontology.ttl",
    "source/ontology/vocabulary.ttl",
    ...filesInDirectory("ontology"),
    ...filesInDirectory("vocab"),
    ...filesInDirectory("source/ontology")
  ];
  return candidates.find((candidate) => fs.existsSync(resolveProjectPath(candidate))) || null;
}

function detectSibling(directory, extensions) {
  const candidates = filesInDirectory(directory).filter((filePath) => extensions.includes(path.extname(filePath).toLowerCase()));
  return candidates[0] || null;
}

function detectExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(resolveProjectPath(candidate))) || null;
}

function inferNamespace(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const ignored = new Set(["rdf", "rdfs", "owl", "xsd", "skos", "sh", "schema"]);
  const prefixMatches = [...source.matchAll(/@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>/gi)];
  const prefix = prefixMatches.find(([_, label]) => !ignored.has(label.toLowerCase()));
  if (prefix) return prefix[2];
  const vocab = source.match(/"@vocab"\s*:\s*"([^\"]+)"/i);
  if (vocab) return vocab[1];
  const xmlNamespace = source.match(/xmlns(?::[A-Za-z][\w-]*)?\s*=\s*["']([^"']+)["']/i);
  return xmlNamespace ? xmlNamespace[1] : null;
}

function filesInDirectory(directory) {
  const absolute = resolveProjectPath(directory);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return [];
  return fs.readdirSync(absolute)
    .filter((entry) => !entry.startsWith("."))
    .map((entry) => path.join(directory, entry).replaceAll("\\", "/"));
}

function serveSite(args) {
  const output = resolveProjectPath(getOption(args, "--output") || "site");
  const host = getOption(args, "--host") || "127.0.0.1";
  const port = Number(getOption(args, "--port") || 4173);
  const server = http.createServer((request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
      const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
      const filePath = path.resolve(output, relativePath);
      if (filePath !== output && !filePath.startsWith(`${output}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      const contentTypes = {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".ico": "image/x-icon",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".ttl": "text/turtle; charset=utf-8"
      };
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(400).end("Bad request");
    }
  });
  server.listen(port, host, () => console.log(`OCG preview: http://${host}:${port}/`));
}

function printHelp() {
  console.log(`Ontology Companion Generator ${PACKAGE_JSON.version}

Usage:
  ocg init [--ontology path] [--force]
  ocg check [--config path] [--output path]
  ocg build [--config path] [--output path]
  ocg clean [--output path]
  ocg dev [--output path] [--host host] [--port port]

Commands:
  init    Create a config, schema, Pages workflow, and npm scripts.
  check   Validate configuration and ontology parsing without writing site output.
  build   Generate the static companion site.
  clean   Remove generated output.
  dev     Build the site and serve it locally for inspection.
`);
}

function getOption(args, option) {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : null;
}

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function relativeProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll("\\", "/");
}

function copyIfMissing(source, destination) {
  if (fs.existsSync(destination)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slugify(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "") || "ontology";
}

function humanize(value) {
  return value.replaceAll(/[._-]+/g, " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortName(value) {
  const initials = value.split(/\s+/).map((word) => word[0]).join("").toUpperCase();
  return (initials || value.replaceAll(/\W/g, "").slice(0, 8)).slice(0, 8);
}
