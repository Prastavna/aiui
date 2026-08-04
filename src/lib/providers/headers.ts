/**
 * Custom request headers are edited as an ordered row list — a Record can't
 * hold a half-typed or duplicated name without losing the user's place — and
 * collapsed back into the Record that `ProviderConfig.headers` stores.
 */
export interface HeaderRow {
  /** Stable across edits so Vue keys rows by identity, not by name. */
  id: string;
  name: string;
  value: string;
}

/**
 * RFC 9110 token characters. `fetch` throws a TypeError on anything else, which
 * would break every request rather than just the offending header, so invalid
 * names are flagged in the UI and dropped before they reach a config.
 */
const HEADER_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function isValidHeaderName(name: string): boolean {
  return HEADER_TOKEN.test(name);
}

/**
 * Collapses rows into the stored shape. Blank and invalid names are skipped;
 * on a repeated name the last row wins, matching plain object assignment.
 * Names keep the casing typed — HTTP treats them case-insensitively.
 */
export function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name || !isValidHeaderName(name)) continue;
    result[name] = row.value;
  }
  return result;
}

/**
 * Names that appear more than once, compared case-insensitively because that's
 * how the transport compares them. Returned in the casing first typed.
 */
export function duplicateHeaderNames(rows: HeaderRow[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const first = seen.get(key);
    if (first === undefined) seen.set(key, name);
    else duplicates.add(first);
  }

  return [...duplicates];
}
