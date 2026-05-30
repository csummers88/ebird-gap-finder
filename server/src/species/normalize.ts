/**
 * Scientific/common-name normalization. This is the single most important place
 * to get right (CLAUDE.md rule #1): inconsistent normalization silently drops
 * matches, which under-counts the life list and invents false gaps.
 */

/**
 * Normalize a name for keying: strip diacritics, lowercase, collapse whitespace,
 * and remove eBird's group/subspecies annotations so the binomial can be recovered.
 *
 * Examples:
 *   "Junco hyemalis [Slate-colored Group]" -> "junco hyemalis"... (see binomial())
 *   "Setophaga  coronata"                  -> "setophaga coronata"
 *   "Bubo  scandiacus "                    -> "bubo scandiacus"
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a scientific name to its genus+species binomial, dropping subspecies
 * epithets and eBird's bracketed/parenthetical group annotations and slash forms.
 *
 *   "junco hyemalis hyemalis"              -> "junco hyemalis"
 *   "junco hyemalis [slate-colored group]" -> "junco hyemalis"
 *   "anas platyrhynchos/rubripes"          -> "anas platyrhynchos" (best-effort)
 */
export function binomial(normalized: string): string {
  // Drop anything from the first bracket/paren onward (group annotations).
  let s = normalized.replace(/[[(].*$/, '').trim();
  // Drop slash alternatives — keep the part before the first slash.
  s = s.split('/')[0]!.trim();
  const parts = s.split(' ').filter(Boolean);
  if (parts.length < 2) return s;
  return `${parts[0]} ${parts[1]}`;
}
