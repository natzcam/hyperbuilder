# hyperbuilder

Small builder for generating hyperschema and hyperdb specs. Favors terseness over flexibility.

This repository provides a tiny DSL-style builder that lets you declare
schemas, collections and dispatch (RPC) request types in JavaScript and
generates ready-to-use artifacts under `spec/`:

- `spec/hyperschema/` — compiled hyperschema runtime encoders and `schema.json`.
- `spec/hyperdb/` — compiled hyperdb collection bindings and `db.json`.

Conventions & patterns
----------------------

- Namespaces: use `@namespace/name` to place items in a namespace. The builder will create the namespace automatically.
- 1:1 collection-schema: each `collection("@ns/foo")` creates a matching
	`@ns/foo` schema used by the collection.
- Structs: `s.struct(name, "@ns/other")` references an existing schema FQN;
	`s.struct(name, (sub) => { ... })` creates a nested inline schema.
- Compact schemas: schemas are compact by default (see `index.js` for details).

