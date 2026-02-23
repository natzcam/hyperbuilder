const Hyperschema = require("hyperschema");
const HyperdbBuilder = require("hyperdb/builder");
const Hyperdispatch = require("hyperdispatch");
const { SupportedTypes } = require("./types");
const path = require("path");
const process = require("process");

class SchemaField {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.required = true;
  }

  optional() {
    this.required = false;
    return this;
  }
}

/**
 * Callback schema passed to `schema(...)` builders.
 * Contains one method per supported hyperschema type so editors can
 * provide autocompletion inside the schema callback.
 *
 * @typedef {Object} SchemaBuilder
 * @property {function(string):SchemaField} uint
 * @property {function(string):SchemaField} uint1
 * @property {function(string):SchemaField} uint2
 * @property {function(string):SchemaField} uint3
 * @property {function(string):SchemaField} uint4
 * @property {function(string):SchemaField} uint5
 * @property {function(string):SchemaField} uint6
 * @property {function(string):SchemaField} uint7
 * @property {function(string):SchemaField} uint8
 * @property {function(string):SchemaField} uint16
 * @property {function(string):SchemaField} uint24
 * @property {function(string):SchemaField} uint32
 * @property {function(string):SchemaField} uint40
 * @property {function(string):SchemaField} uint48
 * @property {function(string):SchemaField} uint56
 * @property {function(string):SchemaField} uint64
 * @property {function(string):SchemaField} int
 * @property {function(string):SchemaField} int8
 * @property {function(string):SchemaField} int16
 * @property {function(string):SchemaField} int24
 * @property {function(string):SchemaField} int32
 * @property {function(string):SchemaField} int40
 * @property {function(string):SchemaField} int48
 * @property {function(string):SchemaField} int56
 * @property {function(string):SchemaField} int64
 * @property {function(string):SchemaField} float32
 * @property {function(string):SchemaField} float64
 * @property {function(string):SchemaField} port
 * @property {function(string):SchemaField} lexint
 * @property {function(string):SchemaField} string
 * @property {function(string):SchemaField} utf8
 * @property {function(string):SchemaField} ascii
 * @property {function(string):SchemaField} hex
 * @property {function(string):SchemaField} bigint
 * @property {function(string):SchemaField} biguint64
 * @property {function(string):SchemaField} bigint64
 * @property {function(string):SchemaField} fixed32
 * @property {function(string):SchemaField} fixed64
 * @property {function(string):SchemaField} buffer
 * @property {function(string):SchemaField} date
 * @property {function(string):SchemaField} bool
 * @property {function(string):SchemaField} ip
 * @property {function(string):SchemaField} ipv4
 * @property {function(string):SchemaField} ipv6
 * @property {function(string):SchemaField} ipAddress
 * @property {function(string):SchemaField} ipv4Address
 * @property {function(string):SchemaField} ipv6Address
 * @property {function(string):SchemaField} none
 * @property {function(string):SchemaField} raw
 * @property {function(string):SchemaField} json
 * @property {function(string, string|function(SchemaBuilder):void):SchemaField} struct
 */
class Schema {
  constructor(namespace, name) {
    this.namespace = namespace;
    this.name = name;
    this.compact = false;
    this.fields = [];

    namespace.schemas.push(this);

    for (const type of SupportedTypes) {
      this[type] = (name) => {
        const field = new SchemaField(name, type);
        this.fields.push(field);
        return field;
      };
    }
  }

  compact(value) {
    this.compact = value;
    return this;
  }

  get fqn() {
    return `@${this.namespace.name}/${this.name}`;
  }

  struct(name, cb) {
    if (typeof cb === "string") {
      const field = new SchemaField(name, cb);
      this.fields.push(field);
      return field;
    } else {
      const schema = new Schema(this.namespace, [this.name, name].join("/"));
      cb(schema);
      const field = new SchemaField(name, schema.fqn);
      this.fields.push(field);
      return field;
    }
  }
}

class CollectionSchema extends Schema {
  constructor(namespace, name, collection) {
    super(namespace, name);
    this.collection = collection;
  }

  key(...key) {
    this.collection.key = key;
    return this;
  }
}

class Collection {
  constructor(namespace, name) {
    // the schema uses the same namespace and name
    this.schema = new CollectionSchema(namespace, name, this);
    this.name = name;
    this.indexes = [];
    this.key = [];

    namespace.schemas.push(this.schema);
    namespace.collections.push(this);
  }
}

class Dispatch {
  constructor(namespace, name, requestType) {
    this.name = name;
    this.requestType = requestType;

    namespace.dispatches.push(this);
  }
}

class Namespace {
  constructor(builder, name) {
    this.builder = builder;
    this.name = name;
    this.schemas = [];
    this.collections = [];
    this.dispatches = [];
  }
}

class Builder {
  constructor(spec) {
    this.schemaPath = path.join(spec, "hyperschema");
    this.dbPath = path.join(spec, "hyperdb");
    this.dispatchPath = path.join(spec, "hyperdispatch");
    this.defaultNs = new Namespace(this, "default");
    this.namespaces = new Map();
    this.namespaces.set("default", this.defaultNs);

    this.schema = this.schema.bind(this);
    this.collection = this.collection.bind(this);
    this.dispatch = this.dispatch.bind(this);
  }

  _extractNamespace(name) {
    const parts = name.split("/");
    let namespace = this.defaultNs;
    if (parts[0].startsWith("@")) {
      const nsName = parts[0].substring(1);
      parts.shift();
      name = parts.join("/");

      namespace = this.namespaces.get(nsName);
      if (!namespace) {
        namespace = new Namespace(this, nsName);
        this.namespaces.set(nsName, namespace);
      }
    }

    return [namespace, name];
  }

  /**
   * Declare a standalone schema.
   * @param {string} name - namespaced name (`@ns/name` or `name`)
   * @param {function(SchemaBuilder):void} cb - callback that configures the schema
   * @returns {Schema}
   */
  schema(name, cb) {
    const [namespace, schemaName] = this._extractNamespace(name);
    const schema = new Schema(namespace, schemaName);
    cb(schema);
    return schema;
  }

  /**
   * Declare a dispatch (RPC) endpoint.
   * The `cb` parameter may be a schema FQN string or a builder callback that
   * receives the same `SchemaBuilder` used by `schema(name, cb)` (see typedef
   * above) so editors can provide the same autocompletion inside the dispatch
   * callback.
   *
   * Examples:
   * - Reference existing schema: `dispatch('@hello/change-name', '@hello/full-name')`
   * - Inline request schema: `dispatch('@hello/put-world', (d) => { d.uint('id') })`
   *
   * @param {string} name - namespaced dispatch name (`@ns/name`)
   * @param {string|function(SchemaBuilder):void} cb - request schema FQN or builder callback
   * @returns {Dispatch}
   */
  dispatch(name, cb) {
    const [namespace, dispatchName] = this._extractNamespace(name);

    if (typeof cb === "string") {
      return new Dispatch(namespace, dispatchName, cb); // cb is the request type
    } else {
      const schema = new Schema(namespace, dispatchName);
      cb(schema);
      return new Dispatch(namespace, dispatchName, schema.fqn);
    }
  }

  /**
   * Declare a collection (database table).
   * The `cb` parameter is a builder callback that receives a `CollectionSchema`
   * which extends the regular `Schema` with additional methods for defining
   *
   * @param {string} name - namespaced collection name (`@ns/name`)
   * @param {string|function(SchemaBuilder):void} cb - request schema FQN or builder callback
   * @returns {Collection}
   */
  collection(name, cb) {
    const [namespace, collectionName] = this._extractNamespace(name);
    const collection = new Collection(namespace, collectionName);
    cb(collection.schema);
    return collection;
  }

  _build() {
    const spec = Hyperschema.from(this.schemaPath);

    for (const namespace of this.namespaces.values()) {
      const buildSchema = spec.namespace(namespace.name);
      for (const schema of namespace.schemas) {
        buildSchema.register({
          name: schema.name,
          compact: schema.compact,
          fields: schema.fields,
        });
      }
    }

    Hyperschema.toDisk(spec);

    const dbSpec = HyperdbBuilder.from(this.schemaPath, this.dbPath);
    for (const namespace of this.namespaces.values()) {
      const db = dbSpec.namespace(namespace.name);
      for (const collection of namespace.collections) {
        db.collections.register({
          name: collection.name,
          schema: `@${namespace.name}/${collection.name}`,
          key: collection.key,
        });
      }
    }
    HyperdbBuilder.toDisk(dbSpec);

    const dispatchSpec = Hyperdispatch.from(this.schemaPath, this.dispatchPath);
    for (const namespace of this.namespaces.values()) {
      const dispatchNs = dispatchSpec.namespace(namespace.name);
      for (const dispatch of namespace.dispatches) {
        dispatchNs.register({
          name: dispatch.name,
          requestType: dispatch.requestType,
        });
      }
    }
    Hyperdispatch.toDisk(dispatchSpec);
  }
}

const builders = [];
process.on("beforeExit", function () {
  for (const builder of builders) {
    builder._build();
  }
});

module.exports = function (spec) {
  const builder = new Builder(spec);
  builders.push(builder);

  return builder;
};
