/** Accept either snake_case (YAML convention) or camelCase keys. Tiny helper
 * shared across the daemon-mergers files. */
export function pick(
  obj: Record<string, unknown>,
  snake: string,
  camel: string,
): unknown {
  return obj[snake] ?? obj[camel];
}
