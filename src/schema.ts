// Checks a value against the part of JSON Schema that the answers Claude gives use: type (or several, null among them),
// enum, required, properties, additionalProperties false, items, minItems, maxItems, and $ref to its own definitions.
// Keywords outside that part, such as description, are ignored.

export interface JsonSchema {
  type?: JsonType | JsonType[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  description?: string;
}

type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

/** What is wrong with `value`, one line per fault with its path, such as `marking[2].category: не string`; empty when nothing is. */
export function schemaErrors(value: unknown, schema: JsonSchema, path = '$', root = schema): string[] {
  if (schema.$ref) {
    const defined = root.definitions?.[schema.$ref.replace('#/definitions/', '')];
    if (!defined) throw new Error(`Нет определения ${schema.$ref}`);
    return schemaErrors(value, defined, path, root);
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => isType(value, t))) return [`${path}: не ${types.join(' или ')}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: не из ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`];
  if (Array.isArray(value)) {
    const errors: string[] = [];
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: меньше ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: больше ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => errors.push(...schemaErrors(item, schema.items!, `${path}[${i}]`, root)));
    return errors;
  }
  if (isType(value, 'object')) {
    const object = value as Record<string, unknown>;
    const errors = (schema.required ?? []).filter((key) => !(key in object)).map((key) => `${path}.${key}: нет`);
    for (const [key, item] of Object.entries(object)) {
      const inner = schema.properties?.[key];
      if (inner) errors.push(...schemaErrors(item, inner, `${path}.${key}`, root));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: лишнее`);
    }
    return errors;
  }
  return [];
}

function isType(value: unknown, type: JsonType): boolean {
  switch (type) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}
