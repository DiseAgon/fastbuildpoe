/** Elemental resistance stat ids — grouped into a `count` group for fuzzy matching. */
export const ELEMENTAL_RES_IDS = {
  fire: "explicit.stat_3372524247",
  cold: "explicit.stat_4220027924",
  lightning: "explicit.stat_1671376347",
} as const;

export const ELEMENTAL_RES_ID_SET: ReadonlySet<string> = new Set(
  Object.values(ELEMENTAL_RES_IDS),
);

export function isElementalResistance(statId: string): boolean {
  return ELEMENTAL_RES_ID_SET.has(statId);
}
