/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) implementation.
 * Used for deterministic cryptographic hashing of JSON-LD / W3C Credential subjects.
 */
export function canonicalizeJson(object: any): string {
  if (object === null || typeof object !== 'object') {
    return JSON.stringify(object);
  }

  if (Array.isArray(object)) {
    const elements: string[] = object.map(item => canonicalizeJson(item));
    return `[${elements.join(',')}]`;
  }

  const sortedKeys = Object.keys(object).sort();
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    if (object[key] !== undefined) {
      const canonicalValue = canonicalizeJson(object[key]);
      pairs.push(`${JSON.stringify(key)}:${canonicalValue}`);
    }
  }

  return `{${pairs.join(',')}}`;
}
