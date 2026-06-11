import type { GameId } from "@/lib/game/registry";

export type Rarity = "normal" | "magic" | "rare" | "unique" | "gem" | "currency";

export type ItemCategory = "gear" | "jewel" | "gem" | "flask";

export type ModType =
  | "implicit"
  | "explicit"
  | "crafted"
  | "fractured"
  | "enchant"
  | "scourge"
  | "unknown";

export interface ParsedMod {
  /** Cleaned mod text with original numeric rolls intact. */
  text: string;
  /** Mod text with each numeric roll replaced by `#` — used for stat-id matching. */
  template: string;
  /** Numeric rolls extracted from the mod, in order. */
  values: number[];
  type: ModType;
}

export interface ParsedItem {
  /** Raw PoB item block (post variant-resolution), kept for debugging/inspection. */
  raw: string;
  rarity: Rarity;
  /** Rare/unique display name; for normal/magic this equals the base line. */
  name: string;
  baseType: string;
  category: ItemCategory;
  /** Equip slot from the item set this item was resolved in, when applicable. */
  slot?: string;
  itemLevel?: number;
  quality?: number;
  /** Skill/support gem level (gems only). */
  gemLevel?: number;
  sockets?: string;
  levelReq?: number;
  /** Computed defences from the item (for equipment-based searching). */
  defences?: { armour?: number; evasion?: number; energyShield?: number; ward?: number };
  corrupted: boolean;
  mods: ParsedMod[];
  /** Mod lines we could not confidently parse — surfaced, never silently dropped. */
  unparsed: string[];
}

/**
 * A linked socket group (one PoB `<Skill>`): the gems socketed and linked
 * together in a single item. Grouping gems this way mirrors how they sit in
 * gear and makes a build's setups easy to scan.
 */
export interface GemGroup {
  /** Group label — the main active skill, or the slot it's socketed in. */
  label: string;
  /** Item slot this group is socketed in (e.g. "Body Armour"), when known. */
  slot?: string;
  gems: ParsedItem[];
}

/**
 * A single PoB item set ("version") with its items grouped by category.
 * Streamer builds commonly ship several (e.g. "Budget", "Mid", "Endgame").
 * Gear and flasks vary per set; jewels and gem groups are build-level and
 * repeated in every view for convenient display.
 */
export interface ItemSetView {
  id: string;
  title: string;
  gear: ParsedItem[];
  jewels: ParsedItem[];
  gems: GemGroup[];
  flasks: ParsedItem[];
}

export interface ParsedBuild {
  game: GameId;
  className?: string;
  ascendancy?: string;
  level?: number;
  itemSets: ItemSetView[];
  activeItemSetId: string;
  /** Item blocks present in the XML that failed to parse into an item. */
  skipped: number;
}
