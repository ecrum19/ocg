# Ontology Companion Generator

`ocg/` is a config-first generator for publishing a GitHub Pages companion site for one ontology or vocabulary per repository.

The recommended usage is to install OCG as a development dependency in the repository that already owns your ontology. OCG points directly at existing vocabulary, shapes, examples, and specification files; they do not need to be cloned, moved, or copied into a separate repository.

This repository is also a complete forkable template and working test/example:
- ontology in `source/ontology/`
- SHACL in `source/shapes/`
- ShEx in `source/shex/`
- example instance data in `source/examples/`
- optional ReSpec specification source in `source/spec/`
- full site customization in `ocg.config.json`

## Recommended Repo Model

Use one ontology repository as the source of truth and run OCG inside that repository.

### Add OCG to an Existing Ontology Repository

1. Install OCG:

```bash
npm install --save-dev ontology-companion-generator
```

2. Initialize it from the repository root. Pass the primary ontology path explicitly when it is not in a conventional location:

```bash
npx ocg init --ontology vocab/my-vocabulary.ttl
```

`ocg init` creates `ocg.config.json`, copies the config schema, creates the GitHub Pages workflow, adds OCG npm scripts, and attempts to detect the namespace and common SHACL, ShEx, and ReSpec files. Review the generated namespace and metadata before publishing.

3. Customize `ocg.config.json`. Source paths are relative to the repository root and may use the existing layout:

```json
{
  "sources": {
    "ontology": "vocab/my-vocabulary.ttl",
    "ontologyFormat": "turtle",
    "shapes": "shapes/my-vocabulary.shacl.ttl",
    "shex": "shex/my-vocabulary.shex",
    "spec": "spec/index.html",
    "examples": [
      {
        "key": "basic",
        "label": "Basic Example",
        "path": "examples/basic.ttl",
        "description": "A minimal valid instance graph."
      }
    ]
  }
}
```

4. Install the lockfile and validate/build:

```bash
npm install
npm run ocg:check
npm run ocg:build
```

5. In repository settings, set GitHub Pages to **GitHub Actions**, then push the configured repository's `main` branch.

The workflow checks out the ontology repository at the pushed commit, builds its configured files, and deploys the generated `site/` directory. The live Pages site is intentionally produced from `main`; feature branches should be used for development and build validation rather than competing deployments to the same Pages site.

### Fork the OCG Template Instead

Forking this repository remains useful when you want a ready-made one-ontology repository. Replace the bundled `source/` package, update `ocg.config.json`, run the build, and push `main`. This is an alternative to integrating OCG into an existing ontology repository, not a requirement.

### Package and CLI Commands

The published package exposes the `ocg` command. Use these commands from the ontology repository root:

OCG currently requires Node.js `22.19.0` or newer. This matches the `undici` runtime used by the RDF parser dependency. The generated GitHub Actions workflow uses Node.js 24.

```bash
npx ocg init --ontology vocab/my-vocabulary.ttl
npm run ocg:check       # validate config and parse the ontology
npm run ocg:build       # generate site/
npm run ocg:dev         # build and serve http://127.0.0.1:4173/
npm run ocg:clean       # remove site/
```

The CLI can also be called directly as `npx ocg build`, `npx ocg check`, `npx ocg dev`, or `npx ocg clean`. `ocg init --force` replaces the generated config but does not overwrite an existing schema or workflow.

## Integration Files

When using the package, only these files need to exist in the ontology repository:

- `ocg.config.json`
- `package.json` and a lockfile containing OCG
- `.github/workflows/publish-pages.yml`
- optionally `ocg.config.schema.json` for editor completion

The ontology, SHACL, ShEx, examples, and ReSpec document remain in their existing repository locations and are referenced through `ocg.config.json`. OCG supplies its own generator code, schema fallback, branding, Sigma.js, Graphology, and source-guide assets from the installed package.

## Layout

```text
.
├── ocg.config.json
├── ocg.config.schema.json   # created by ocg init; optional after that
├── package.json
├── package-lock.json
├── vocab/                   # example existing ontology location
├── shapes/                  # example existing shapes location
├── shex/                    # example existing ShEx location
├── examples/                # example existing instance-data location
├── spec/                    # example existing specification location
├── site/                    # generated
└── .github/workflows/publish-pages.yml
```

## Commands

```bash
npm run ocg:check
npm run ocg:build
npm run ocg:dev
npm run ocg:clean
```

`ocg build` generates:
- `site/index.html`
- `site/ontology-reference.html`
- `site/ontology-graph.html`
- `site/spec/index.html` when `features.specPage` is enabled
- `site/usage-guide.html` when `features.usageGuidePage` is enabled
- `site/terms/*.html`
- copied source artifacts in `site/assets/`

## Config Surface

`ocg.config.json` is the main customization surface.

It controls:
- project metadata: title, slug, namespace, canonical URI, version, maintainer
- source paths: ontology, shapes, shex, examples, and optional ReSpec document
- feature toggles: graph page, reference page, term pages, raw viewer, hierarchy asset, specification page, and in-app usage guide
- graph representations: local Sigma.js/Graphology graph, WebVOWL graph, default graph view, WebVOWL service and ontology URL
- site copy: hero text, overview cards, custom narrative sections, footer, generator attribution links
- curation: featured terms and raw viewer tab order
- theme: fonts and colors

The full structure is documented in [ocg.config.schema.json](/Users/eliascrum/PhD_Things/ocg/ocg.config.schema.json).

### Accepted Input Formats

OCG uses the [`rdf-parse`](https://github.com/rubensworks/rdf-parse.js) library to parse the primary ontology into RDF/JS quads. The supported ontology formats are intentionally limited to:

- Turtle: `.ttl`, `.turtle`
- RDF/XML: `.rdf`, `.rdfxml`, `.owl`
- JSON-LD: `.jsonld`
- N-Triples: `.nt`, `.ntriples`

With `sources.ontologyFormat: "auto"`, OCG selects the parser from the file extension. Set `sources.ontologyFormat` explicitly to `turtle`, `rdfxml`, `jsonld`, or `ntriples` when the file extension is ambiguous. A valid example is:

```json
{
  "sources": {
    "ontology": "source/ontology/my-vocabulary.json",
    "ontologyFormat": "jsonld"
  }
}
```

OCG does not currently accept TriG, N-Quads, Notation3, OWL Functional Syntax, Manchester OWL Syntax, OWL/XML, OBO, arbitrary XML, arbitrary JSON/YAML, CSV, UML/XMI, JSON Schema, OpenAPI, or Protobuf as primary ontology inputs. These formats require additional semantic mapping or preservation rules and will not be inferred silently. SHACL and ShEx files remain optional published artifacts; they are not currently parsed into the generated graph.

### Usage Guide Page

OCG can generate an in-app [Usage Guide](/Users/eliascrum/PhD_Things/ocg/site/usage-guide.html) so visitors can understand the companion site without opening the repository README. It covers existing-repository integration, the optional fork workflow, repository layout, and every generated component with option descriptions and complete JSON examples, including artifacts, the reference page, graph modes, term pages, ReSpec, theme, footer attribution, GitHub Pages, and useful commands. Enable or disable it with:

```json
"features": {
  "usageGuidePage": true
}
```

When enabled, the generated navigation includes Usage Guide and component pages include context-specific `How To` links that target the relevant guide section.

### Generator Footer

Every generated OCG page includes a footer identifying the OCG version from `package.json`. Configure the repository and help links under `site.generator`:

```json
"site": {
  "generator": {
    "repositoryUrl": "https://github.com/ecrum19/ocg",
    "documentationUrl": "https://github.com/ecrum19/ocg#readme"
  }
}
```

The footer renders the generator version, an OCG repository link, and a documentation link when their URLs are configured.

### ReSpec Specification Page

The specification page is an optional first-class page rather than a downloadable artifact. Place a ReSpec HTML document in the configured `sources.spec` path and enable it with `features.specPage`:

```json
{
  "sources": {
    "spec": "source/spec/index.html"
  },
  "features": {
    "specPage": true
  }
}
```

The build copies the source document to `site/spec/index.html`, injects the OCG brand/navigation bar at the top, and adds a `Specification` link to the generated navigation. The injected links are relative to the generated `spec/` directory, so users can return to the home, reference, graph, or term pages without using the browser back button. The document owns its ReSpec configuration, so replace the bundled example with your vocabulary's title, short name, editors, status, bibliography, and specification sections. Set `features.specPage` to `false` to omit the page and navigation link; when enabled, `sources.spec` is required.

### Graph Representations

The Ontology Graph page can expose WebVOWL and one or both custom Sigma.js modes. The custom renderer uses Sigma.js and Graphology, with nodes, edges, filters, labels, hover details, click selection/highlighting, edge selection details, repeated-click deselection, and draggable node layout generated from `ontology_graph_data.json`. Edges use a forgiving geometry-based hit area in addition to Sigma's native hit testing, so users do not need to click the exact one-pixel line. The build copies the pinned Sigma.js and Graphology browser bundles from `node_modules` into `site/assets/vendor/`, so the generated Pages site does not depend on a CDN for the custom graph. WebVOWL is loaded in an iframe from the configured service and uses the published ontology asset by default.

```json
"graph": {
  "defaultView": "custom",
  "custom": {
    "enabled": true,
    "defaultMode": "predicate-nodes",
    "modes": {
      "predicateNodes": true,
      "predicateEdges": true
    }
  },
  "webvowl": {
    "enabled": true,
    "serviceUrl": "https://service.tib.eu/webvowl/",
    "ontologyUrl": "",
    "height": 760
  },
  "colors": {
    "class": "#b7dcf6",
    "objectProperty": "#bee7c3",
    "datatypeProperty": "#f7d7ab",
    "annotationProperty": "#f2c8cf",
    "concept": "#d3c5f6",
    "declaredTerm": "#e1e8ef",
    "external": "#dfe6ee",
    "subClassOf": "#1f6f92",
    "domain": "#2f8040",
    "range": "#ab6b22",
    "broader": "#7b5ca7"
  }
}
```

Set either graph representation's `enabled` value to `false` to remove it from the generated page. Set either `custom.modes` value to `false` to remove that custom mode. `custom.defaultMode` must name an enabled custom mode. `predicate-nodes` preserves the current VORD-style graph where ontology properties are visible as nodes connected by domain/range edges. `predicate-edges` removes object, datatype, and annotation property terms from the node set and emits their domain-to-range relationships as labeled predicate edges. When both custom modes are enabled, the custom graph displays its own mode toggle. When both custom modes are disabled, the build fails rather than producing an empty graph. Leave `webvowl.ontologyUrl` empty to let the page derive the public URL for the copied ontology asset; set it explicitly when the ontology is published at another stable URL. The WebVOWL service must be able to fetch that URL, so the default asset URL will work after deployment to GitHub Pages but not from a `file://` preview.

## Built-In Test Example

The default `source/` package is a complete example ontology called `Example Capability Vocabulary`.

It exists to demonstrate:
- ontology term extraction
- graph and hierarchy generation
- per-term HTML pages
- example artifact tabs
- ReSpec specification page
- config-driven landing page customization
- GitHub Pages publishing

If you want to inspect the bundled test example, start with:
- [ocg.config.json](/Users/eliascrum/PhD_Things/ocg/ocg.config.json)
- [source/ontology/example-capability.ttl](/Users/eliascrum/PhD_Things/ocg/source/ontology/example-capability.ttl)
- [source/README-source-guide.txt](/Users/eliascrum/PhD_Things/ocg/source/README-source-guide.txt)

## GitHub Pages

The included workflow builds the site and deploys `site/` through GitHub Actions.

In your repository settings, configure Pages to use **GitHub Actions** as the source. The workflow deploys only pushes to `main` (plus manual dispatch), so the live site is stable and is not overwritten by arbitrary feature-branch pushes. Use `npm run ocg:check` and `npm run ocg:build` on a feature branch to validate changes before merging.

GitHub Pages does not dynamically render the branch currently selected in the GitHub file browser. A workflow that deploys every branch would send each branch to the same Pages site, with the latest deployment replacing the previous one. For branch-specific previews, use a separate preview host or upload build artifacts without deploying them to the live Pages environment.
