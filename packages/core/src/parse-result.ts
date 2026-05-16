export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export function isParseResultOk<T>(result: ParseResult<T>): result is { ok: true; value: T } {
  return result.ok === true;
}
