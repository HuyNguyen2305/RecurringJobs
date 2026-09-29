// Returns a copy of `value` with every string (at any depth in objects and arrays) trimmed.
// Numbers, booleans and null are returned untouched; the input is never mutated.
export function trimStrings(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(trimStrings);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimStrings(item)]));
  }
  return value;
}
