import type { GameId } from "@/lib/game/registry";
import type {
  GemGroup,
  ItemSetView,
  ModType,
  ParsedBuild,
  ParsedItem,
  ParsedMod,
  Rarity,
} from "@/types/item";
import { categorize, flaskRank, gearSlotRank } from "@/lib/pob/categorize";

/**
 * Parse the official PoE character API response (api.pathofexile.com/character/{name})
 * into the same ParsedBuild model used for pobb.in imports. The character API
 * returns clean JSON (mods already separated), so no text parsing is needed.
 */

interface ApiProperty {
  name?: string;
  values?: Array<[string, number]>;
}

interface ApiItem {
  name?: string;
  typeLine?: string;
  baseType?: string;
  ilvl?: number;
  frameType?: number;
  corrupted?: boolean;
  inventoryId?: string;
  properties?: ApiProperty[];
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  fracturedMods?: string[];
  enchantMods?: string[];
  runeMods?: string[];
  socketedItems?: ApiItem[];
  sockets?: Array<{ group: number }>;
}

interface ApiCharacter {
  name?: string;
  class?: string;
  level?: number;
  items?: ApiItem[];
}

const NUMBER = /-?\d+(?:\.\d+)?/g;

const FRAME_RARITY: Record<number, Rarity> = {
  0: "normal",
  1: "magic",
  2: "rare",
  3: "unique",
  4: "gem",
  5: "currency",
  9: "unique", // relic
};

/** inventoryId → display slot name (aligned with PoB slot naming). */
function slotName(inventoryId: string | undefined, x: number): string | undefined {
  switch (inventoryId) {
    case "Weapon":
      return "Weapon 1";
    case "Offhand":
      return "Weapon 2";
    case "Weapon2":
      return "Weapon 1 Swap";
    case "Offhand2":
      return "Weapon 2 Swap";
    case "Helm":
      return "Helmet";
    case "BodyArmour":
      return "Body Armour";
    case "Gloves":
      return "Gloves";
    case "Boots":
      return "Boots";
    case "Amulet":
      return "Amulet";
    case "Ring":
      return "Ring 1";
    case "Ring2":
      return "Ring 2";
    case "Belt":
      return "Belt";
    case "Flask":
      return `Flask ${x + 1}`;
    default:
      return inventoryId || undefined;
  }
}

function toMod(text: string, type: ModType): ParsedMod {
  const values = (text.match(NUMBER) ?? []).map(Number);
  return { text, template: text.replace(NUMBER, "#"), values, type };
}

function propValue(props: ApiProperty[] | undefined, name: string): number | undefined {
  const p = props?.find((x) => x.name === name);
  const raw = p?.values?.[0]?.[0];
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseApiItem(item: ApiItem, x = 0): ParsedItem {
  const rarity = FRAME_RARITY[item.frameType ?? 0] ?? "normal";
  const baseType = item.baseType || item.typeLine || "";
  const slot = slotName(item.inventoryId, x);
  const name = item.name || item.typeLine || baseType;

  const mods: ParsedMod[] = [
    ...(item.enchantMods ?? []).map((m) => toMod(m, "enchant")),
    ...(item.implicitMods ?? []).map((m) => toMod(m, "implicit")),
    ...(item.fracturedMods ?? []).map((m) => toMod(m, "fractured")),
    ...(item.explicitMods ?? []).map((m) => toMod(m, "explicit")),
    ...(item.craftedMods ?? []).map((m) => toMod(m, "crafted")),
    ...(item.runeMods ?? []).map((m) => toMod(m, "explicit")),
  ];

  const defences = {
    armour: propValue(item.properties, "Armour"),
    evasion: propValue(item.properties, "Evasion Rating") ?? propValue(item.properties, "Evasion"),
    energyShield: propValue(item.properties, "Energy Shield"),
    ward: propValue(item.properties, "Ward"),
  };
  const hasDefence = Object.values(defences).some((v) => v && v > 0);

  return {
    raw: name,
    rarity,
    name,
    baseType,
    category: categorize(slot, baseType, rarity),
    slot,
    itemLevel: item.ilvl,
    quality: propValue(item.properties, "Quality"),
    sockets: undefined,
    defences: hasDefence ? defences : undefined,
    corrupted: !!item.corrupted,
    mods,
    unparsed: [],
  };
}

/** Gems come from each gear item's socketedItems; group them by host item. */
function parseGems(items: ApiItem[]): GemGroup[] {
  const groups: GemGroup[] = [];
  for (const host of items) {
    const socketed = host.socketedItems ?? [];
    const gems: ParsedItem[] = [];
    for (const s of socketed) {
      if ((s.frameType ?? 0) !== 4) continue; // gems only
      const name = s.typeLine || s.baseType || "";
      if (!name) continue;
      gems.push({
        raw: name,
        rarity: "gem",
        name,
        baseType: "Gem",
        category: "gem",
        gemLevel: propValue(s.properties, "Level"),
        quality: propValue(s.properties, "Quality"),
        corrupted: !!s.corrupted,
        mods: [],
        unparsed: [],
      });
    }
    if (gems.length === 0) continue;
    const active = gems.find((g) => !/support/i.test(g.name));
    groups.push({
      label: active?.name ?? gems[0].name,
      slot: slotName(host.inventoryId, 0),
      gems,
    });
  }
  return groups;
}

export function parseCharacter(character: ApiCharacter, game: GameId): ParsedBuild {
  const items = character.items ?? [];
  const gear: ParsedItem[] = [];
  const jewels: ParsedItem[] = [];
  const flasks: ParsedItem[] = [];
  const charms: ParsedItem[] = [];

  for (const item of items) {
    // Skip the flask "slot" letters etc. via x position (Flask uses x 0..4).
    const x = (item as ApiItem & { x?: number }).x ?? 0;
    const parsed = parseApiItem(item, x);
    switch (parsed.category) {
      case "jewel":
        jewels.push(parsed);
        break;
      case "flask":
        flasks.push(parsed);
        break;
      case "charm":
        charms.push(parsed);
        break;
      case "gem":
        break; // gems handled via socketedItems
      default:
        gear.push(parsed);
    }
  }

  gear.sort((a, b) => gearSlotRank(a.slot) - gearSlotRank(b.slot));
  flasks.sort((a, b) => flaskRank(a.slot) - flaskRank(b.slot));

  const view: ItemSetView = {
    id: "1",
    title: character.name || "Character",
    gear,
    jewels,
    gems: parseGems(items),
    flasks,
    charms,
  };

  return {
    game,
    className: character.class,
    ascendancy: undefined,
    level: character.level,
    itemSets: [view],
    activeItemSetId: "1",
    skipped: 0,
  };
}
