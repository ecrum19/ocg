import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const PACKAGE_VERSION = PACKAGE_JSON.version;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("build-site produces the expected publish artifacts for the bundled example", () => {
  assert.match(PACKAGE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(PACKAGE_JSON.engines.node, ">=22.19.0");
  assert.doesNotMatch(PACKAGE_JSON.engines.node, /</g, "the Node engine should not impose an upper version limit");
  assert.equal(PACKAGE_JSON.repository.url, "git+https://github.com/ecrum19/ocg.git");
  assert.equal(PACKAGE_JSON.publishConfig.registry, "https://registry.npmjs.org/");
  for (const dependency of ["rdf-parse", "graphology", "graphology-layout-forceatlas2", "graphology-layout-noverlap", "sigma"]) {
    assert.ok(PACKAGE_JSON.dependencies?.[dependency], `${dependency} should be a declared dependency`);
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
  assert.match(indexHtml, /\.featured-term-card h3 a[\s\S]*overflow-wrap: anywhere/);
  assert.match(indexHtml, /class="site-footer-generator"/);
  assert.match(indexHtml, /class="site-footer-separator" aria-hidden="true">\|<\/span>/);
  assert.match(indexHtml, new RegExp(`Generated with <strong>OCG<\\/strong> v${escapeRegExp(PACKAGE_VERSION)}`));
  assert.match(indexHtml, /class="ocg-footer-repository"/);
  assert.match(indexHtml, /src="ocg-favicon\.png"/);
  assert.match(indexHtml, /href="https:\/\/github\.com\/ecrum19\/ocg"/);
  assert.match(indexHtml, /href="https:\/\/github\.com\/ecrum19\/ocg#readme"/);
  assert.doesNotMatch(indexHtml, /Ontology Companion Generator template example\./);
  assert.doesNotMatch(indexHtml, /Edit ocg\.config\.json and the source\//);
  assert.match(indexHtml, /href="usage-guide\.html#home">How To</);
  assert.match(indexHtml, /href="usage-guide\.html#artifacts">How To</);
  assert.match(indexHtml, />View File</);
  for (const label of ["Specification Source", "Basic Capability Example", "Advanced Capability Example"]) {
    assert.match(indexHtml, new RegExp(`data-label="${escapeRegExp(label)}"`));
  }
  for (const label of ["Config Schema", "GitHub Pages Workflow", "Source Replacement Guide"]) {
    assert.doesNotMatch(indexHtml, new RegExp(`data-label="${escapeRegExp(label)}"`));
  }
  assert.doesNotMatch(indexHtml, />Open (TTL|File|Example)</);
  assert.doesNotMatch(indexHtml, /<dt>Namespace<\/dt>/);
  assert.match(indexHtml, /id="copy-namespace"/);
  assert.match(indexHtml, /<h2>Repository Workflow<\/h2>/);
  assert.match(indexHtml, /These cards come directly from ocg\.config\.json/);
  assert.match(indexHtml, /<h2>Artifact Viewer<\/h2>/);
  assert.match(indexHtml, /class="section section--overview"/);
  assert.match(indexHtml, /\.page-home \.section--overview \.section-note \{\s*max-width: none;/);
  assert.match(indexHtml, /\.page-home \.section--overview \.card p,[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(indexHtml, /\.site-header \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(indexHtml, /\.brand \{[\s\S]*?flex: 1 1 360px;/);
  assert.match(indexHtml, /\.brand-copy strong,[\s\S]*?word-break: break-word;/);
  assert.match(indexHtml, /<aside class="page-toc" aria-label="On this page">/);
  assert.match(indexHtml, /href="#ontology-snapshot">Ontology Snapshot/);
  assert.match(indexHtml, /href="#repository-workflow">Repository Workflow/);
  assert.match(indexHtml, /href="#featured-terms">Featured Terms/);
  assert.match(indexHtml, /class="page-content-layout"/);
  assert.match(indexHtml, /data-page-toc-toggle/);
  assert.match(indexHtml, /function setPageTocCollapsed/);
  assert.match(indexHtml, /page-content-layout--toc-collapsed/);

  const referenceHtml = fs.readFileSync(path.join(ROOT, "site/ontology-reference.html"), "utf8");
  assert.match(referenceHtml, /id="ontology-hierarchy"/);
  assert.match(referenceHtml, /<h2>Ontology Structure<\/h2>/);
  assert.match(referenceHtml, /class="hierarchy-tree"/);
  assert.match(referenceHtml, /class="hierarchy-links"/);
  assert.match(referenceHtml, /href="terms\/Capability\.html"><span>Capability<\/span>/);
  for (const heading of ["Classes", "Object Properties", "Datatype Properties", "Annotation Properties", "Concepts"]) {
    assert.match(referenceHtml, new RegExp(`<h2>${heading}<\\/h2>`));
  }
  assert.doesNotMatch(referenceHtml, /Classs|Propertys/);
  assert.match(referenceHtml, /href="#reference-overview">Overview/);
  assert.match(referenceHtml, /href="#ontology-hierarchy">Ontology Structure/);
  assert.match(referenceHtml, /href="#reference-class">Classes/);
  assert.match(referenceHtml, /id="reference-objectProperty"/);

  const termHtml = fs.readFileSync(path.join(ROOT, "site/terms/Capability.html"), "utf8");
  assert.match(termHtml, /href="#term-overview">ecv:Capability/);
  assert.match(termHtml, /href="#outgoing-relationships">Outgoing Relationships/);
  assert.match(termHtml, /href="#incoming-relationships">Incoming Relationships/);
  const termsIndexHtml = fs.readFileSync(path.join(ROOT, "site/terms/index.html"), "utf8");
  assert.doesNotMatch(termsIndexHtml, /<aside class="page-toc"/);

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
  const graphLabelWidth = (node) => {
    let width = 18;
    for (const character of String(node.qname || node.label || "")) {
      width += /[MW@#%&]/.test(character)
        ? 8.6
        : /[ilI1|.:,'`]/.test(character)
          ? 4.2
          : /[A-Z0-9]/.test(character)
            ? 7.4
            : 6.6;
    }
    return Math.min(420, Math.max(72, width));
  };
  for (const node of graphData.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.qname} should have an initial position`);
  }
  for (const [modeName, mode] of Object.entries(graphData.modes)) {
    const isolatedNodes = mode.nodes.filter((node) => node.degree === 0);
    if (isolatedNodes.length > 1) {
      assert.equal(
        new Set(isolatedNodes.map((node) => node.y)).size,
        1,
        `${modeName} should pack isolated terms into a compact horizontal band`
      );
    }
  }
  for (let leftIndex = 0; leftIndex < graphData.nodes.length; leftIndex += 1) {
    const left = graphData.nodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < graphData.nodes.length; rightIndex += 1) {
      const right = graphData.nodes[rightIndex];
      const verticalDistance = Math.abs(left.y - right.y);
      const leftLabel = { start: left.x + 10, end: left.x + 10 + graphLabelWidth(left) };
      const rightLabel = { start: right.x + 10, end: right.x + 10 + graphLabelWidth(right) };
      const labelsOverlapHorizontally = leftLabel.start < rightLabel.end && rightLabel.start < leftLabel.end;
      assert.ok(
        !(labelsOverlapHorizontally && verticalDistance < 32),
        `${left.qname} and ${right.qname} should not overlap in the initial label layout`
      );
    }
  }
  const firstLayout = Object.fromEntries(
    Object.entries(graphData.modes).map(([modeName, mode]) => [
      modeName,
      mode.nodes.map(({ id, x, y }) => ({ id, x, y }))
    ])
  );
  execFileSync("node", ["scripts/build-site.mjs"], { cwd: ROOT, stdio: "pipe" });
  const rebuiltGraphData = JSON.parse(
    fs.readFileSync(path.join(ROOT, "site/assets/ontology_graph_data.json"), "utf8")
  );
  const rebuiltLayout = Object.fromEntries(
    Object.entries(rebuiltGraphData.modes).map(([modeName, mode]) => [
      modeName,
      mode.nodes.map(({ id, x, y }) => ({ id, x, y }))
    ])
  );
  assert.deepEqual(rebuiltLayout, firstLayout, "graph coordinates should be deterministic across builds");

  const graphHtml = fs.readFileSync(path.join(ROOT, "site/ontology-graph.html"), "utf8");
  assert.match(graphHtml, /Ontology Network/);
  assert.match(graphHtml, /WebVOWL/);
  assert.match(graphHtml, /assets\/vendor\/graphology\.umd\.min\.js/);
  assert.match(graphHtml, /assets\/vendor\/sigma\.min\.js/);
  assert.match(graphHtml, /id="webvowl-frame"/);
  assert.match(graphHtml, /service\.tib\.eu\/webvowl/);
  assert.match(graphHtml, /id="sigma-toggle-external"/);
  assert.match(graphHtml, /id="sigma-canvas" class="sigma-canvas"/);
  assert.match(graphHtml, /class="sigma-panel"/);
  assert.match(graphHtml, /data-graph-expand="custom-graph-panel"/);
  assert.match(graphHtml, /data-graph-expand="webvowl-graph-panel"/);
  assert.match(graphHtml, /class="graph-expand-btn graph-expand-btn--icon"/);
  assert.match(graphHtml, /data-graph-expand-icon="compress"/);
  assert.match(graphHtml, /Press Esc to exit full screen\./);
  assert.match(graphHtml, /data-sigma-controls-toggle/);
  assert.match(graphHtml, /id="sigma-selection-block"/);
  assert.doesNotMatch(graphHtml, />Edge Details</);
  assert.doesNotMatch(graphHtml, /id="sigma-edge-hover-info"/);
  assert.match(graphHtml, /function setGraphControlsCollapsed/);
  assert.match(graphHtml, /graph-controls-collapsed/);
  assert.doesNotMatch(graphHtml, /graph-panel-toolbar/);
  assert.doesNotMatch(graphHtml, /data-graph-expand-label/);
  assert.match(graphHtml, /height: 100%;\s+min-height: 0;\s+border: 0;/);
  assert.match(graphHtml, /function toggleGraphPanel/);
  assert.match(graphHtml, /requestFullscreen/);
  assert.match(graphHtml, /graph-panel--expanded/);
  assert.match(graphHtml, /Predicates as Nodes/);
  assert.match(graphHtml, /Predicates as Edges/);
  assert.match(graphHtml, /function toViewportPoint/);
  assert.match(graphHtml, /function selectEdge/);
  assert.match(graphHtml, /function updateDetailForEdge/);
  assert.match(graphHtml, /function revealSelectionDetails/);
  assert.match(graphHtml, /sidebarEl\.scrollTo/);
  assert.match(graphHtml, /EDGE_HIT_TOLERANCE = 14/);
  assert.match(graphHtml, /function findNearbyEdge/);
  assert.match(graphHtml, /function getNodeAtPoint/);
  assert.match(graphHtml, /function getNodeLabelPlacement/);
  assert.match(graphHtml, /getNodeDisplayData/);
  assert.match(graphHtml, /measureText\(label\)/);
  assert.match(graphHtml, /function updateFallbackHover/);
  assert.match(graphHtml, /function selectNode/);
  assert.match(graphHtml, /hoverRenderer: \(\) => \{\}/);
  assert.match(graphHtml, /enableEdgeHoverEvents: false/);
  assert.match(graphHtml, /enableEdgeClickEvents: false/);
  assert.doesNotMatch(graphHtml, /function claimClick/);
  assert.doesNotMatch(graphHtml, /nativeClickHandled/);
  assert.match(graphHtml, /aria-label="Ontology Network mode"/);
  assert.match(graphHtml, /container\.addEventListener\("pointermove", updateFallbackHover/);
  assert.match(graphHtml, /container\.addEventListener\("pointerleave"/);
  assert.match(graphHtml, /container\.addEventListener\("click", handleGraphClick/);
  assert.match(graphHtml, /interactionAbortController\?\.abort\(\)/);
  assert.match(graphHtml, /baseForceLabel/);
  assert.match(graphHtml, /function drawReadableNodeLabel/);
  assert.doesNotMatch(graphHtml, /function runGraphologyRelaxation/);
  assert.match(graphHtml, /labelGridCellSize: LABEL_SETTINGS\.gridCellSize/);
  assert.match(graphHtml, /labelDensity: LABEL_SETTINGS\.density/);
  assert.match(graphHtml, /stagePadding: 72/);
  assert.match(graphHtml, /forceAllLabels/);
  assert.match(graphHtml, /if \(selectedEdge === edgeId\)/);
  assert.match(graphHtml, /if \(selectedNode === node\)/);
  assert.match(graphHtml, /renderer\.getMouseCaptor\(\)/);
  assert.match(graphHtml, /window\.addEventListener\("blur", endDrag, \{ signal \}\)/);
  assert.match(graphHtml, /renderer\.on\("downNode"/);
  assert.doesNotMatch(graphHtml, /renderer\.on\("clickNode"/);
  assert.doesNotMatch(graphHtml, /renderer\.on\("clickEdge"/);
  assert.doesNotMatch(graphHtml, /renderer\.on\("clickStage"/);
  assert.doesNotMatch(graphHtml, /renderer\.on\("enterNode"/);
  assert.doesNotMatch(graphHtml, /renderer\.on\("enterEdge"/);
  assert.match(graphHtml, /setupRendererInteractions\(\);/);
  assert.match(graphHtml, /mouseCaptor\.on\("mousedown"/);
  assert.match(graphHtml, /mouseCaptor\.on\("mousemovebody"/);
  assert.match(graphHtml, /\.sigma-panel \{[\s\S]*?grid-auto-rows: max-content;/);
  assert.match(graphHtml, /\.sigma-block \{[\s\S]*?overflow: visible;/);
  assert.match(graphHtml, /class=\\"sigma-detail-heading\\"/);
  assert.match(graphHtml, /class=\\"sigma-detail-metadata\\"/);
  assert.match(graphHtml, /\.graph-expand-btn--icon svg\[hidden\]/);
  assert.match(graphHtml, /href="usage-guide\.html#graph">How To</);
  assert.doesNotMatch(graphHtml, /<aside class="page-toc"/);

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
  assert.match(specHtml, new RegExp(`Generated with <strong>OCG<\\/strong> v${escapeRegExp(PACKAGE_VERSION)}`));
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
  assert.match(guideHtml, /href="#branding">.*Theme, Page Navigation, Footer, and Generator Links/);
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
    "features.hierarchyOverview",
    "hierarchy.rootTerms",
    "hierarchy.maxDepth",
    "hierarchy.maxChildrenPerNode",
    "hierarchy.maxNodes",
    "hierarchy.includePropertyRelations",
    "hierarchy.labelMode",
    "site.home.actions",
    "site.home.metadata",
    "site.home.snapshot.title",
    "site.home.overview.title",
    "site.home.featuredTerms.emptyBody",
    "site.home.examples.linkText",
    "site.home.viewer.viewFileText",
    "site.home.artifacts",
    "site.toc.enabled",
    "site.toc.title",
    "site.toc.collapseLabel",
    "site.toc.expandLabel",
    "site.customSections[].items",
    "graph.custom.modes.predicateEdges",
    "graph.custom.label",
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
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|upload-pages-artifact|deploy-pages)@v[234]\b/);
  assert.doesNotMatch(workflow, /test -f site\/ontology-reference\.html/);
  assert.doesNotMatch(workflow, /test -f site\/ontology-graph\.html/);

  const npmWorkflow = fs.readFileSync(path.join(ROOT, ".github/workflows/publish-npm.yml"), "utf8");
  assert.match(npmWorkflow, /tags:\s*\n\s+- "v\*\.\*\.\*"/);
  assert.match(npmWorkflow, /id-token:\s*write/);
  assert.match(npmWorkflow, /registry-url: https:\/\/registry\.npmjs\.org/);
  assert.match(npmWorkflow, /npm install --global npm@latest/);
  assert.match(npmWorkflow, /npm test/);
  assert.match(npmWorkflow, /npm publish/);
  assert.match(npmWorkflow, /actions\/checkout@v5/);
  assert.match(npmWorkflow, /actions\/setup-node@v6/);
  assert.doesNotMatch(npmWorkflow, /actions\/(?:checkout|setup-node)@v[234]\b/);
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

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...originalConfig,
          graph: {
            ...originalConfig.graph,
            webvowl: {
              ...originalConfig.graph.webvowl,
              ontologyUrl: originalConfig.project.namespace
            }
          }
        },
        null,
        2
      )
    );
    assert.throws(
      () => execFileSync("node", ["scripts/build-site.mjs", "--check"], { cwd: ROOT, stdio: "pipe" }),
      (error) => `${error.stdout || ""}${error.stderr || ""}`.includes("must be a public ontology document URL")
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
    assert.equal(config.curation.autoFeaturedTerms, true);
    assert.equal(config.curation.featuredTermLimit, 6);
    assert.deepEqual(config.curation.viewerTabs, []);
    assert.equal(config.features.hierarchyOverview, false);
    assert.equal(config.hierarchy.maxNodes, 36);
    assert.equal(config.project.namespace, "https://example.org/ecv#");
    assert.equal(config.site.home.overview.title, "Repository Workflow");
    assert.equal(config.site.home.viewer.title, "Artifact Viewer");
    assert.equal(config.site.home.artifacts.ontologyLabel, "OWL Ontology");
    assert.equal(config.site.toc.enabled, true);
    assert.equal(config.site.toc.title, "On this page");
    assert.equal(config.site.toc.collapseLabel, "Collapse page contents");
    assert.equal(config.site.toc.expandLabel, "Expand page contents");
    assert.equal(fs.existsSync(path.join(tempDir, "ocg.config.schema.json")), true);
    assert.equal(fs.existsSync(path.join(tempDir, ".github", "workflows", "publish-pages.yml")), true);
    const projectPackage = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf8"));
    assert.equal(projectPackage.devDependencies["ontology-companion-generator"], `^${PACKAGE_VERSION}`);
    assert.equal(projectPackage.scripts["ocg:build"], "ocg build");
    assert.match(
      fs.readFileSync(path.join(tempDir, ".github", "workflows", "publish-pages.yml"), "utf8"),
      /npm run ocg:build/
    );

    execFileSync(process.execPath, [cliPath, "check"], { cwd: tempDir, stdio: "pipe" });
    execFileSync(process.execPath, [cliPath, "build"], { cwd: tempDir, stdio: "pipe" });
    const indexHtml = fs.readFileSync(path.join(tempDir, "site", "index.html"), "utf8");
    assert.match(indexHtml, /class="card featured-term-card"/);
    assert.match(indexHtml, /data-label="OWL Ontology"/);
    assert.doesNotMatch(indexHtml, /data-label="Config Schema"/);

    fs.writeFileSync(path.join(tempDir, "context.json"), "{\"example\":true}\n");
    config.site.home = {
      ...config.site.home,
      actions: {
        ...config.site.home.actions,
        reference: "Read the Reference",
        ontology: "Vocabulary Source"
      },
      metadata: {
        ...config.site.home.metadata,
        canonicalUri: "Vocabulary IRI",
        unspecified: "Not provided"
      },
      snapshot: {
        title: "Vocabulary at a Glance",
        body: "Counts derived from this vocabulary source."
      },
      overview: {
        title: "Using This Vocabulary",
        body: "Project-specific onboarding guidance."
      },
      featuredTerms: {
        ...config.site.home.featuredTerms,
        title: "Key Terms"
      },
      examples: {
        ...config.site.home.examples,
        title: "Example Data",
        defaultDescription: "Configured example data.",
        linkText: "View Example"
      },
      viewer: {
        title: "Source Viewer",
        body: "Select a published source file.",
        viewFileText: "View Source",
        loadingText: "Loading source..."
      },
      artifacts: {
        ...config.site.home.artifacts,
        ontologyLabel: "Vocabulary Source",
        ontologyDescription: "Published primary vocabulary file."
      }
    };
    config.project.title = "Example Capability Vocabulary for Distributed Research Infrastructure and Interoperable Services";
    config.project.shortName = "Example Capability Vocabulary";
    config.site.toc = {
      enabled: true,
      title: "Page map",
      collapseLabel: "Hide page map",
      expandLabel: "Show page map"
    };
    config.site.overviewCards = [
      {
        title: "Start Here",
        body: "Read the project guidance before using the vocabulary. This deliberately long card description confirms that editorial content can wrap naturally across multiple lines without being clipped by its container."
      }
    ];
    config.sources.artifacts = [
      {
        key: "context",
        label: "Context JSON",
        path: "context.json",
        description: "Additional metadata."
      }
    ];
    fs.writeFileSync(path.join(tempDir, "ocg.config.json"), JSON.stringify(config, null, 2));
    execFileSync(process.execPath, [cliPath, "build"], { cwd: tempDir, stdio: "pipe" });
    const artifactIndexHtml = fs.readFileSync(path.join(tempDir, "site", "index.html"), "utf8");
    assert.match(artifactIndexHtml, /Read the Reference/);
    assert.match(artifactIndexHtml, /Vocabulary Source/);
    assert.match(artifactIndexHtml, /<dt>Vocabulary IRI<\/dt>/);
    assert.match(artifactIndexHtml, /<h2>Vocabulary at a Glance<\/h2>/);
    assert.match(artifactIndexHtml, /Counts derived from this vocabulary source\./);
    assert.match(artifactIndexHtml, /<h2>Using This Vocabulary<\/h2>/);
    assert.match(artifactIndexHtml, /Project-specific onboarding guidance\./);
    assert.match(artifactIndexHtml, /Example Capability Vocabulary for Distributed Research Infrastructure and Interoperable Services/);
    assert.match(artifactIndexHtml, /This deliberately long card description confirms that editorial content can wrap naturally/);
    assert.match(artifactIndexHtml, /<h2>Key Terms<\/h2>/);
    assert.match(artifactIndexHtml, /<h2>Source Viewer<\/h2>/);
    assert.match(artifactIndexHtml, />View Source</);
    assert.match(artifactIndexHtml, /<aside class="page-toc" aria-label="Page map">/);
    assert.match(artifactIndexHtml, /aria-label="Hide page map"/);
    assert.doesNotMatch(artifactIndexHtml, /<h2>Repository Workflow<\/h2>/);
    assert.doesNotMatch(artifactIndexHtml, /These cards come directly from ocg\.config\.json/);
    assert.match(artifactIndexHtml, /data-label="Vocabulary Source"/);
    assert.match(artifactIndexHtml, /data-file="assets\/context\.json"/);
    assert.match(artifactIndexHtml, /data-label="Context JSON"/);
    assert.equal(fs.existsSync(path.join(tempDir, "site", "assets", "context.json")), true);
    const graphData = JSON.parse(
      fs.readFileSync(path.join(tempDir, "site", "assets", "ontology_graph_data.json"), "utf8")
    );
    assert.ok(graphData.nodes.length > 0);
    assert.equal(fs.existsSync(path.join(tempDir, "site", "assets", "vendor", "sigma.min.js")), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
