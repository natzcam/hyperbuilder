# hyperbuilder

DSL-style builder tool for generating hyperschema, hyperdb and hyperdispatch specs. Favors terseness over flexibility.

```js
const { schema, collection, dispatch } = require("./index.js")("./spec");

// define a standalone schema
schema("@hello/full-name", (s) => {
  s.string("first-name");
  s.string("last-name");
});

// create a collection with inline schema
collection("@hello/users", (c) => {
  c.key("id")
  c.uint("id");
  c.uint("age");
  c.struct("name", "@hello/full-name"); // struct with schema reference
  c.struct("address", (s) => { // struct with nested inline schema (@hello/users/address)
    s.string("city");
    s.string("country");
  });
});

// dispatch with schema reference
dispatch("@hello/change-name", "@hello/full-name");

// dispatch with inline schema
dispatch("@hello/change-address", (d) => {
  d.string("city");
  d.string("country");
});
```

Conventions & patterns
----------------------

- Namespaces: use `@namespace/name` to place items in a namespace. The builder will create the namespace automatically.
- 1:1 collection-schema: each `collection("@ns/foo")` creates a matching
	`@ns/foo` schema used by the collection.
- Structs: `s.struct(name, "@ns/other")` references an existing schema FQN;
	`s.struct(name, (sub) => { ... })` creates a nested inline schema.
- Compact schemas: schemas are compact by default (see `index.js` for details).

