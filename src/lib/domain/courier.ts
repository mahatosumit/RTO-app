const UNKNOWN_TOKENS = new Set(["", "unknown", "na", "n/a", "null", "none", "-", "?", "nan", "undefined", "not assigned"]);

export const UNKNOWN_COURIER = "Unknown";

/** Key used to merge spelling/case/punctuation variants of the same courier. */
export function courierKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function isUnknownCourier(raw: string | null | undefined): boolean {
  return UNKNOWN_TOKENS.has(String(raw ?? "").trim().toLowerCase());
}

/** Display name for a raw courier string: collapse whitespace, title-case when all-lower/all-upper. */
export function prettyCourier(raw: string | null | undefined): string {
  if (isUnknownCourier(raw)) return UNKNOWN_COURIER;
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return s;
}

/**
 * Registry that merges variants within one import. The first mixed-case variant seen becomes
 * the canonical display name; aliases are recorded so the merge is reviewable.
 */
export class CourierRegistry {
  private names = new Map<string, { name: string; mixed: boolean }>();
  private aliases = new Map<string, Set<string>>();

  resolve(raw: string | null | undefined): { name: string; known: boolean } {
    if (isUnknownCourier(raw)) return { name: UNKNOWN_COURIER, known: false };
    const key = courierKey(raw);
    if (!key) return { name: UNKNOWN_COURIER, known: false };
    const trimmed = String(raw).trim().replace(/\s+/g, " ");
    const isMixed = trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase();
    const existing = this.names.get(key);
    if (!existing || (!existing.mixed && isMixed)) this.names.set(key, { name: prettyCourier(raw), mixed: isMixed });
    const a = this.aliases.get(key) ?? new Set<string>();
    a.add(String(raw).trim());
    this.aliases.set(key, a);
    return { name: this.names.get(key)!.name, known: true };
  }

  /** Final display name after the whole file has been seen (a mixed-case variant wins over all-lower/upper). */
  finalName(name: string): string {
    if (name === UNKNOWN_COURIER) return name;
    return this.names.get(courierKey(name))?.name ?? name;
  }

  aliasesFor(name: string): string[] {
    for (const [key, n] of this.names) if (n.name === name) return [...(this.aliases.get(key) ?? [])];
    return [];
  }
}
