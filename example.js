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
