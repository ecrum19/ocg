import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("build-site produces the expected publish artifacts for the bundled example", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.version, "1.1.0");
  assert.equal(packageJson.repository.url, "git+https://github.com/ecrum19/ocg.git");
  assert.equal(packageJson.publishConfig.registry, "https://registry.npmjs.org/");
  for (const dependency of ["rdf-parse", "graphology", "sigma"]) {
    assert.ok(packageJson.dependencies?.[dependency], `${dependency} should be a declared dependency`);
  }

  execFileSync("node", ["scripts/build-site.mjs"], {
    cwd: ROOT,
    stdio: "pipe"
  });

  const requiredFiles = [
    "site/index.html",
    "site/favicon.ico",
    "site/favicon.png",
    "site/ocg-favicon.png",
    "site/ontology-reference.html",
    "site/ontology-graph.html",
    "site/spec/index.html",
    "site/usage-guide.html",
    "site/assets/vendor/graphology.umd.min.js",
    "site/assets/vendor/sigma.min.js",
    "site/assets/ontology_graph_data.json",
    "site/assets/ontology_hierarchy.ttl",
    "site/terms/Capability.html",
    "site/terms/index.html"
  ];

  for (const relative of requiredFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${relative} should exist`);
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, "site/index.html"), "utf8");
  assert.match(indexHtml, /Example Capability Vocabulary/);
  assert.match(indexHtml, /rel="icon" href="favicon\.ico"/);
  assert.match(indexHtml, /rel="icon" type="image\/png" sizes="512x512" href="favicon\.png"/);
  assert.match(indexHtml, /Config-First Ontology Companion/);
  assert.match(indexHtml, /A config-first companion site for your ontology\./);
  assert.doesNotMatch(indexHtml, /Single-Ontology|one ontology per repository|one vocabulary-oriented GitHub Pages site per fork/);
  assert.match(indexHtml, />OWL Ontology</);
  assert.match(indexHtml, />Specification</);
  assert.doesNotMatch(indexHtml, />Spec Page</);
  assert.match(indexHtml, /href="terms\/index\.html">Terms</);
  assert.match(indexHtml, /href="spec\/index\.html">Specification</);
  assert.match(indexHtml, /hero-action-group--artifacts" style="--artifact-count: 3/);
  assert.match(indexHtml, /class="card-grid featured-terms-grid"/);
  assert.match(indexHtml, /class="card featured-term-card"/);
  assert.match(indexHtml, /class="site-footer-generator"/);
  assert.match(indexHtml, /class="site-footer-separator" aria-hidden="true">\|<\/span>/);
  assert.match(indexHtml, /Generated with <strong>OCG<\/strong> v1\.1\.0/);
  assert.match(indexHtml, /class="ocg-footer-repository"/);
  assert.match(indexHtml, /src="ocg-favicon\.png"/);
  assert.match(indexHtml, /href="https:\/\/github\.com\/ecrum19\/ocg"/);
  assert.match(indexHtml, /href="https:\/\/github\.com\/ecrum19\/ocg#readme"/);
  assert.doesNotMatch(indexHtml, /Ontology Companion Generator template example\./);
  assert.doesNotMatch(indexHtml, /Edit ocg\.config\.json and the source\//);
  assert.match(indexHtml, /href="usage-guide\.html#home">How To</);
  assert.match(indexHtml, /href="usage-guide\.html#artifacts">How To</);
  assert.match(indexHtml, />View File</);
  assert.doesNotMatch(indexHtml, />Open (TTL|File|Example)</);
  assert.doesNotMatch(indexHtml, /<dt>Namespace<\/dt>/);
  assert.match(indexHtml, /id="copy-namespace"/);

  const navHtml = indexHtml.match(/<nav class="site-nav">([\s\S]*?)<\/nav>/)?.[1] || "";
  const navOrder = [
    'href="index.html">Home',
    'href="ontology-reference.html">Reference',
    'href="terms/index.html">Terms',
    'href="ontology-graph.html">Graph',
    'href="spec/index.html">Specification'
  ];
  let previousNavIndex = -1;
  for (const item of navOrder) {
    const itemIndex = navHtml.indexOf(item);
    assert.ok(itemIndex > previousNavIndex, `${item} should follow the configured navigation order`);
    previousNavIndex = itemIndex;
  }

  const graphData = JSON.parse(
    fs.readFileSync(path.join(ROOT, "site/assets/ontology_graph_data.json"), "utf8")
  );
  assert.equal(graphData.project.shortName, "ECV");
  assert.ok(graphData.nodes.some((node) => node.qname === "ecv:Capability"));
  assert.ok(graphData.nodes.every((node) => Number.isFinite(node.degree)));
  assert.ok(graphData.edges.every((edge) => edge.id && edge.predicateQname));
  assert.equal(graphData.modes["predicate-nodes"].nodes.length, graphData.nodes.length);
  assert.equal(graphData.modes["predicate-nodes"].edges.length, graphData.edges.length);
  assert.ok(
    graphData.modes["predicate-edges"].nodes.every(
      (node) => !["objectProperty", "datatypeProperty", "annotationProperty"].includes(node.termType)
    )
  );
  assert.ok(graphData.modes["predicate-edges"].edges.some((edge) => edge.predicateQname === "ecv:hasRequirement"));

  const graphHtml = fs.readFileSync(path.join(ROOT, "site/ontology-graph.html"), "utf8");
  assert.match(graphHtml, /Custom Graph/);
  assert.match(graphHtml, /WebVOWL/);
  assert.match(graphHtml, /assets\/vendor\/graphology\.umd\.min\.js/);
  assert.match(graphHtml, /assets\/vendor\/sigma\.min\.js/);
  assert.match(graphHtml, /id="webvowl-frame"/);
  assert.match(graphHtml, /service\.tib\.eu\/webvowl/);
  assert.match(graphHtml, /id="sigma-toggle-external"/);
  assert.match(graphHtml, /class="sigma-panel"/);
  assert.match(graphHtml, /Predicates as Nodes/);
  assert.match(graphHtml, /Predicates as Edges/);
  assert.match(graphHtml, /enableNodeHoverEvents: true/);
  assert.match(graphHtml, /enableNodeClickEvents: true/);
  assert.match(graphHtml, /function toViewportPoint/);
  assert.match(graphHtml, /function selectEdge/);
  assert.match(graphHtml, /function updateDetailForEdge/);
  assert.match(graphHtml, /EDGE_HIT_TOLERANCE = 14/);
  assert.match(graphHtml, /function findNearbyEdge/);
  assert.match(graphHtml, /function getNodeAtPoint/);
  assert.match(graphHtml, /getNodeDisplayData/);
  assert.match(graphHtml, /measureText\(label\)/);
  assert.match(graphHtml, /function updateFallbackHover/);
  assert.match(graphHtml, /if \(selectedEdge === edgeId\)/);
  assert.match(graphHtml, /if \(selectedNode === node\)/);
  assert.match(graphHtml, /renderer\.getMouseCaptor\(\)/);
  assert.match(graphHtml, /window\.addEventListener\("blur", endDrag\)/);
  assert.match(graphHtml, /renderer\.on\("downNode"/);
  assert.match(graphHtml, /renderer\.on\("clickNode"/);
  assert.match(graphHtml, /renderer\.on\("clickEdge"/);
  assert.match(graphHtml, /renderer\.on\("clickStage"/);
  assert.match(graphHtml, /renderer\.on\("enterNode"/);
  assert.match(graphHtml, /renderer\.on\("enterEdge"/);
  assert.match(graphHtml, /setupRendererInteractions\(\);/);
  assert.match(graphHtml, /mouseCaptor\.on\("mousedown"/);
  assert.match(graphHtml, /mouseCaptor\?\.on\?\.\("click", handleFallbackClick\)/);
  assert.match(graphHtml, /mouseCaptor\?\.on\?\.\("mousemovebody", updateFallbackHover\)/);
  assert.match(graphHtml, /href="usage-guide\.html#graph">How To</);

  const specHtml = fs.readFileSync(path.join(ROOT, "site/spec/index.html"), "utf8");
  assert.match(specHtml, /Tools\/respec\/respec-w3c/);
  assert.match(specHtml, /var respecConfig/);
  assert.match(specHtml, /features\.specPage/);
  assert.match(specHtml, /class="ocg-spec-header"/);
  assert.match(specHtml, /rel="icon" href="\.\.\/favicon\.ico"/);
  assert.match(specHtml, /rel="icon" type="image\/png" sizes="512x512" href="\.\.\/favicon\.png"/);
  assert.match(specHtml, /href="\.\.\/index\.html"/);
  assert.match(specHtml, /is-active" href="\.\.\/spec\/index\.html"/);
  assert.match(specHtml, /class="ocg-spec-footer"/);
  assert.match(specHtml, /class="site-footer-separator" aria-hidden="true">\|<\/span>/);
  assert.match(specHtml, /Generated with <strong>OCG<\/strong> v1\.1\.0/);
  assert.match(specHtml, /class="ocg-footer-repository"/);
  assert.match(specHtml, /src="\.\.\/ocg-favicon\.png"/);
  assert.doesNotMatch(specHtml, /Ontology Companion Generator template example\./);
  assert.doesNotMatch(specHtml, /Edit ocg\.config\.json and the source\//);
  assert.match(specHtml, /href="\.\.\/usage-guide\.html#specification">How To</);

  const guideHtml = fs.readFileSync(path.join(ROOT, "site/usage-guide.html"), "utf8");
  assert.match(guideHtml, /id="existing-repository"/);
  assert.match(guideHtml, /<h2>Existing Repository Integration<\/h2>/);
  assert.match(guideHtml, /vocab\/my-vocabulary\.ttl/);
  assert.match(guideHtml, /Do not copy OCG internals/);
  assert.match(guideHtml, /feature branches cannot overwrite the live site/);
  assert.match(guideHtml, /id="getting-started"/);
  assert.match(guideHtml, /id="accepted-input-formats"/);
  assert.match(guideHtml, /<h2>Accepted Input Formats<\/h2>/);
  assert.match(guideHtml, /OWL\/XML/);
  assert.match(guideHtml, /source\/ontology\/my-vocabulary\.jsonld/);
  assert.match(guideHtml, /<section class="guide-hero section">\s*<details class="guide-toc" open>/);
  assert.doesNotMatch(guideHtml, />On This Page</);
  assert.match(guideHtml, /class="guide-toc-summary"/);
  assert.match(guideHtml, /aria-label="Usage Guide table of contents"/);
  assert.match(guideHtml, /class="guide-toc-list"/);
  assert.match(guideHtml, /class="guide-toc-item guide-toc-item--level-0"/);
  assert.match(guideHtml, /class="guide-toc-item guide-toc-item--level-1"/);
  assert.match(guideHtml, /href="#graph">.*Ontology Graph/);
  assert.match(guideHtml, /href="#branding">.*Theme, Footer, and Generator Links/);
  assert.match(guideHtml, /id="components"/);
  assert.match(guideHtml, /id="configuration"/);
  for (const componentId of [
    "project",
    "home",
    "artifacts",
    "reference",
    "graph",
    "terms",
    "specification",
    "usage-guide",
    "branding"
  ]) {
    assert.match(guideHtml, new RegExp(`id="${componentId}"`));
  }
  for (const option of [
    "$schema",
    "project.maintainer",
    "sources.examples[].description",
    "features.hierarchyAsset",
    "site.customSections[].items",
    "graph.custom.modes.predicateEdges",
    "graph.webvowl.height",
    "graph.colors.broader",
    "theme.colors.accentStrong",
    "site.generator.documentationUrl",
    "curation.viewerTabs"
  ]) {
    assert.match(guideHtml, new RegExp(`<code>${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</code>`));
  }
  assert.match(guideHtml, /Predicates as Edges/);
  assert.match(guideHtml, /Complete Configuration Example/);
  assert.match(guideHtml, /Basic Example/);
  assert.match(guideHtml, /id="package-cli"/);
  assert.match(guideHtml, /npm install --save-dev ontology-companion-generator/);
  assert.match(guideHtml, /npm run ocg:build/);

  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/publish-pages.yml"), "utf8");
  assert.match(workflow, /branches:\s*\n\s+- main/);
  assert.match(workflow, /node-version: 24/);
  assert.doesNotMatch(workflow, /test -f site\/ontology-reference\.html/);
  assert.doesNotMatch(workflow, /test -f site\/ontology-graph\.html/);

  const npmWorkflow = fs.readFileSync(path.join(ROOT, ".github/workflows/publish-npm.yml"), "utf8");
  assert.match(npmWorkflow, /tags:\s*\n\s+- "v\*\.\*\.\*"/);
  assert.match(npmWorkflow, /id-token:\s*write/);
  assert.match(npmWorkflow, /registry-url: https:\/\/registry\.npmjs\.org/);
  assert.match(npmWorkflow, /npm install --global npm@latest/);
  assert.match(npmWorkflow, /npm test/);
  assert.match(npmWorkflow, /npm publish/);
  assert.match(npmWorkflow, /test "v\$\{PACKAGE_VERSION\}" = "\$\{TAG_NAME\}"/);
  assert.doesNotMatch(npmWorkflow, /NPM_TOKEN/);
});

test("build-site accepts the documented primary ontology formats", () => {
  const configPath = path.join(ROOT, "ocg.config.json");
  const originalConfigText = fs.readFileSync(configPath, "utf8");
  const originalConfig = JSON.parse(originalConfigText);
  const tempDir = fs.mkdtempSync(path.join(ROOT, ".ocg-format-test-"));
  const formatInputs = [
    {
      format: "turtle",
      extension: "ttl",
      content: `@prefix ecv: <https://example.org/ecv#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ecv:FormatClass a owl:Class ; rdfs:label "Format Class" .`
    },
    {
      format: "rdfxml",
      extension: "rdf",
      content: `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
  <owl:Class rdf:about="https://example.org/ecv#FormatClass"><rdfs:label>Format Class</rdfs:label></owl:Class>
</rdf:RDF>`
    },
    {
      format: "jsonld",
      extension: "jsonld",
      content: JSON.stringify({
        "@context": {
          ecv: "https://example.org/ecv#",
          owl: "http://www.w3.org/2002/07/owl#",
          rdfs: "http://www.w3.org/2000/01/rdf-schema#"
        },
        "@id": "ecv:FormatClass",
        "@type": "owl:Class",
        "rdfs:label": "Format Class"
      })
    },
    {
      format: "ntriples",
      extension: "nt",
      content: `<https://example.org/ecv#FormatClass> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .\n<https://example.org/ecv#FormatClass> <http://www.w3.org/2000/01/rdf-schema#label> "Format Class" .`
    }
  ];

  try {
    for (const input of formatInputs) {
      const sourcePath = path.join(tempDir, `ontology.${input.extension}`);
      fs.writeFileSync(sourcePath, input.content);
      const testConfig = {
        ...originalConfig,
        sources: {
          ...originalConfig.sources,
          ontology: sourcePath,
          ontologyFormat: input.format
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
      execFileSync("node", ["scripts/build-site.mjs"], { cwd: ROOT, stdio: "pipe" });

      const graphData = JSON.parse(
        fs.readFileSync(path.join(ROOT, "site/assets/ontology_graph_data.json"), "utf8")
      );
      assert.equal(graphData.sourceFormat, input.format);
      assert.ok(graphData.nodes.some((node) => node.uri === "https://example.org/ecv#FormatClass"));
    }

    const unsupportedPath = path.join(tempDir, "ontology.trig");
    fs.writeFileSync(unsupportedPath, "<https://example.org/ecv#FormatClass> {} .");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...originalConfig,
          sources: { ...originalConfig.sources, ontology: unsupportedPath, ontologyFormat: "auto" }
        },
        null,
        2
      )
    );
    assert.throws(
      () => execFileSync("node", ["scripts/build-site.mjs"], { cwd: ROOT, stdio: "pipe" }),
      (error) => `${error.stdout || ""}${error.stderr || ""}`.includes("Unsupported ontology format")
    );
  } finally {
    fs.writeFileSync(configPath, originalConfigText);
    fs.rmSync(tempDir, { recursive: true, force: true });
    execFileSync("node", ["scripts/build-site.mjs"], { cwd: ROOT, stdio: "pipe" });
  }
});

test("ocg CLI initializes and builds an external ontology repository", () => {
  const tempDir = fs.mkdtempSync(path.join(ROOT, ".ocg-cli-test-"));
  const sourcePath = path.join(ROOT, "source", "ontology", "example-capability.ttl");
  fs.copyFileSync(sourcePath, path.join(tempDir, "ontology.ttl"));

  try {
    const cliPath = path.join(ROOT, "bin", "ocg.mjs");
    execFileSync(process.execPath, [cliPath, "init", "--ontology", "ontology.ttl"], {
      cwd: tempDir,
      stdio: "pipe"
    });

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, "ocg.config.json"), "utf8"));
    assert.equal(config.sources.ontology, "ontology.ttl");
    assert.equal(config.project.namespace, "https://example.org/ecv#");
    assert.equal(fs.existsSync(path.join(tempDir, "ocg.config.schema.json")), true);
    assert.equal(fs.existsSync(path.join(tempDir, ".github", "workflows", "publish-pages.yml")), true);
    const projectPackage = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf8"));
    assert.equal(projectPackage.devDependencies["ontology-companion-generator"], "^1.1.0");
    assert.equal(projectPackage.scripts["ocg:build"], "ocg build");
    assert.match(
      fs.readFileSync(path.join(tempDir, ".github", "workflows", "publish-pages.yml"), "utf8"),
      /npm run ocg:build/
    );

    execFileSync(process.execPath, [cliPath, "check"], { cwd: tempDir, stdio: "pipe" });
    execFileSync(process.execPath, [cliPath, "build"], { cwd: tempDir, stdio: "pipe" });
    const graphData = JSON.parse(
      fs.readFileSync(path.join(tempDir, "site", "assets", "ontology_graph_data.json"), "utf8")
    );
    assert.ok(graphData.nodes.length > 0);
    assert.equal(fs.existsSync(path.join(tempDir, "site", "assets", "vendor", "sigma.min.js")), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
