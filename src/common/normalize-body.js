import { trimStrings } from '#common/trim-strings.js';

function allowsNull(schema) {
  const { type } = schema ?? {};
  return type === 'null' || (Array.isArray(type) && type.includes('null'));
}

/**
 * Walks `value` alongside its JSON schema and turns a blank string into null wherever the
 * schema already accepts null (the optional text fields), so "no value" is always stored
 * as NULL. Blank strings in other fields are kept, so validation rejects them with their
 * usual message. Returns a copy; the input is never mutated.
 */
export function nullifyBlankOptionals(value, schema) {
  if (!schema) {
    return value;
  }
  if (value === '' && allowsNull(schema)) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => nullifyBlankOptionals(item, schema.items));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        nullifyBlankOptionals(item, schema.properties?.[key]),
      ]),
    );
  }
  return value;
}

// Every request body is trimmed, then blank optional text becomes null - before validation.
export function normalizeBody(body, schema) {
  return nullifyBlankOptionals(trimStrings(body), schema);
}
