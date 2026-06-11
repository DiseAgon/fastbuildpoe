import type { ItemCategory, Rarity } from "@/types/item";

/**
 * Canonical display order for equipment slots. Lower = shown first.
 * Mirrors the in-game paper-doll reading order.
 */
const GEAR_SLOT_ORDER: Record<string, number> = {
  "Weapon 1": 0,
  "Weapon 2": 1,
  Helmet: 2,
  "Body Armour": 3,
  Gloves: 4,
  Boots: 5,
  Amulet: 6,
  "Ring 1": 7,
  "Ring 2": 8,
  Belt: 9,
  "Weapon 1 Swap": 20,
  "Weapon 2 Swap": 21,
};

export function gearSlotRank(slot?: string): number {
  if (!slot) return 90;
  return slot in GEAR_SLOT_ORDER ? GEAR_SLOT_ORDER[slot] : 80;
}

export function flaskRank(slot?: string): number {
  const match = slot?.match(/Flask\s*(\d+)/i);
  return match ? Number(match[1]) : 99;
}

/** Decide which display group an item belongs to. */
export function categorize(
  slot: string | undefined,
  baseType: string,
  rarity: Rarity,
): ItemCategory {
  if (rarity === "gem") return "gem";
  if ((slot && /flask/i.test(slot)) || /\bflask\b/i.test(baseType)) return "flask";
  if (/\bjewel\b/i.test(baseType)) return "jewel";
  return "gear";
}
