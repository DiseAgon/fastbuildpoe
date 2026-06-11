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
  /** Match the value exactly (min = max), e.g. timeless jewel seeds. */
  exact?: boolean;
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
  // Timeless jewels (PoE1): conqueror variants are a family; the seed must match
  // EXACTLY (it determines the passive transforms), hence exact: true.
  {
    key: "timeless-gv",
    label: "Glorious Vanity",
    exact: true,
    texts: [
      "Bathed in the blood of # sacrificed in the name of Xibaqua",
      "Bathed in the blood of # sacrificed in the name of Ahuana",
      "Bathed in the blood of # sacrificed in the name of Doryani",
      "Bathed in the blood of # sacrificed in the name of Zerphi",
    ],
  },
  {
    key: "timeless-lp",
    label: "Lethal Pride",
    exact: true,
    texts: [
      "Commanded leadership over # warriors under Kaom",
      "Commanded leadership over # warriors under Rakiata",
      "Commanded leadership over # warriors under Akoya",
      "Commanded leadership over # warriors under Kiloava",
    ],
  },
  {
    key: "timeless-br",
    label: "Brutal Restraint",
    exact: true,
    texts: [
      "Denoted service of # dekhara in the akhara of Balbala",
      "Denoted service of # dekhara in the akhara of Asenath",
      "Denoted service of # dekhara in the akhara of Nasima",
      "Denoted service of # dekhara in the akhara of Deshret",
    ],
  },
  {
    key: "timeless-mf",
    label: "Militant Faith",
    exact: true,
    texts: [
      "Carved to glorify # new faithful converted by High Templar Avarius",
      "Carved to glorify # new faithful converted by High Templar Maxarius",
      "Carved to glorify # new faithful converted by High Templar Dominus",
      "Carved to glorify # new faithful converted by High Templar Venarius",
    ],
  },
  {
    key: "timeless-eh",
    label: "Elegant Hubris",
    exact: true,
    texts: [
      "Commissioned # coins to commemorate Cadiro",
      "Commissioned # coins to commemorate Victario",
      "Commissioned # coins to commemorate Caspiro",
      "Commissioned # coins to commemorate Chitus",
    ],
  },
];
