OCG is intended to run inside the repository that already owns your ontology. Install the `ontology-companion-generator` package; you do not need to clone or branch the OCG repository, and you do not need to move your source files into source/.

Recommended workflow:
1. Keep your ontology in its existing repository location using one of the supported formats: Turtle (.ttl/.turtle), RDF/XML (.rdf/.rdfxml/.owl), JSON-LD (.jsonld), or N-Triples (.nt/.ntriples).
2. Use Node.js 22.19.0 or newer. Run `npm install --save-dev ontology-companion-generator`, then initialize the project with `npx ocg init --ontology path/to/ontology.ttl`. The command creates the config, schema, workflow, and OCG npm scripts.
3. Update `ocg.config.json` so the source paths, ontology format override, project metadata, feature toggles, hero text, theme, and featured terms match your ontology. Set `sources.ontologyFormat` to `turtle`, `rdfxml`, `jsonld`, or `ntriples` when auto-detection is not appropriate. Set `features.specPage` to true to publish the ReSpec document at `spec/index.html`.
4. Run `npm run ocg:check`, then `npm run ocg:build` from the repository root. The build vendors the Sigma.js and Graphology browser bundles into `site/assets/vendor/`.
5. Configure GitHub Pages to use GitHub Actions and push the ontology repository's `main` branch. Feature branches should be validated locally or with build-only CI rather than deployed to the live Pages site.

The OCG repository also contains a complete forkable example, but installing the package into your existing ontology repository is the recommended workflow.
