import type { ModType, Rarity } from "@/types/item";

export const RARITY_TEXT_CLASS: Record<Rarity, string> = {
  normal: "text-rarity-normal",
  magic: "text-rarity-magic",
  rare: "text-rarity-rare",
  unique: "text-rarity-unique",
  gem: "text-rarity-gem",
  currency: "text-accent",
};

export const RARITY_BORDER_CLASS: Record<Rarity, string> = {
  normal: "border-rarity-normal/30",
  magic: "border-rarity-magic/40",
  rare: "border-rarity-rare/40",
  unique: "border-rarity-unique/50",
  gem: "border-rarity-gem/40",
  currency: "border-accent/40",
};

export const MOD_TYPE_LABEL: Record<ModType, string> = {
  implicit: "implicit",
  explicit: "explicit",
  crafted: "crafted",
  fractured: "fractured",
  enchant: "enchant",
  scourge: "scourge",
  unknown: "mod",
};

export const MOD_TYPE_CLASS: Record<ModType, string> = {
  implicit: "text-muted",
  explicit: "text-text",
  crafted: "text-rarity-gem",
  fractured: "text-rarity-unique",
  enchant: "text-accent",
  scourge: "text-red-400",
  unknown: "text-muted",
};
