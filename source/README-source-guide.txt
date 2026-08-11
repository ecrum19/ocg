Replace the example files in source/ with your ontology package.

Recommended workflow:
1. Put your ontology in source/ontology/ using one of the supported formats: Turtle (.ttl/.turtle), RDF/XML (.rdf/.rdfxml/.owl), JSON-LD (.jsonld), or N-Triples (.nt/.ntriples).
2. Optionally add SHACL, ShEx, examples, and a ReSpec document to the matching source/ subdirectories.
3. Update ocg.config.json so the source paths, ontology format override, project metadata, feature toggles, hero text, theme, and featured terms match your ontology. Set sources.ontologyFormat to turtle, rdfxml, jsonld, or ntriples when auto-detection is not appropriate. Set features.specPage to true to publish the ReSpec document at spec/index.html.
4. Run npm run build to regenerate the site/.
5. Push to main so the GitHub Pages workflow republishes the generated site.

The default repository content is intentionally complete so you can inspect a working example before replacing anything.
