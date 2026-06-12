/**
 * Build a PostgREST `.or()` filter for ilike search across multiple columns.
 * Values are double-quoted so commas and other reserved characters in user input
 * do not break the filter syntax.
 */
export function buildIlikeOrFilter(
  columns: string[],
  search: string
): string {
  const sanitized = search.replace(/[%_]/g, "");
  const escaped = sanitized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = `"%${escaped}%"`;

  return columns.map((col) => `${col}.ilike.${pattern}`).join(",");
}
