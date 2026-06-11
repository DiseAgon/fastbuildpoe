/**
 * Mod "families" of the same kind. When an item has one member, the search
 * emits a count group containing the whole family — the item's members enabled,
 * the rest added disabled (unchecked) so the user can tick them on the trade
 * site to broaden. Members are resolved to stat ids per game at query time
 * (texts that don't exist in a game are simply skipped).
 */
export interface ModFamily {
  key: string;
  label: string;
  /** Canonical stat texts (with `#` placeholders) of the family members. */
  texts: string[];
}

export const MOD_FAMILIES: ModFamily[] = [
  {
    key: "atk",
    label: "attack dmg",
    texts: [
      "Adds # to # Physical Damage to Attacks",
      "Adds # to # Fire Damage to Attacks",
      "Adds # to # Cold Damage to Attacks",
      "Adds # to # Lightning Damage to Attacks",
      "Adds # to # Chaos Damage to Attacks",
    ],
  },
  {
    key: "spell",
    label: "spell dmg",
    texts: [
      "Adds # to # Fire Damage to Spells",
      "Adds # to # Cold Damage to Spells",
      "Adds # to # Lightning Damage to Spells",
      "Adds # to # Chaos Damage to Spells",
    ],
  },
  {
    key: "res",
    label: "resistances",
    texts: [
      "#% to Fire Resistance",
      "#% to Cold Resistance",
      "#% to Lightning Resistance",
      "#% to Chaos Resistance",
    ],
  },
  {
    key: "attr",
    label: "attributes",
    texts: ["# to Strength", "# to Dexterity", "# to Intelligence"],
  },
  {
    key: "eledmg",
    label: "elemental dmg",
    texts: [
      "#% increased Fire Damage",
      "#% increased Cold Damage",
      "#% increased Lightning Damage",
    ],
  },
];
