import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { JsonSchema } from "../src/catalog.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

/** Ajv's strict draft 2020-12 build with the `date` and `date-time` formats the catalog uses. */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  return ajv;
}

/**
 * Validates a value against a catalog schema with Ajv's draft 2020-12 build, formats included, and
 * returns one line per violation. Compiled validators are cached per schema object.
 */
export function schemaChecker(): (schema: JsonSchema, value: unknown) => string[] {
  const ajv = createAjv();
  const compiled = new WeakMap<JsonSchema, ValidateFunction>();
  return (schema, value) => {
    let validate = compiled.get(schema);
    if (!validate) {
      validate = ajv.compile(schema);
      compiled.set(schema, validate);
    }
    if (validate(value)) return [];
    return (validate.errors ?? []).map(
      (e) => `${e.instancePath || "/"} ${e.message ?? e.keyword} ${JSON.stringify(e.params)}`,
    );
  };
}
