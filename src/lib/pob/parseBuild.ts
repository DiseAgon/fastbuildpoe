import { XMLParser } from "fast-xml-parser";
import type { GameId } from "@/lib/game/registry";
import type { GemGroup, ItemSetView, ParsedBuild, ParsedItem } from "@/types/item";
import { parseItemText } from "./parseItemText";
import { flaskRank, gearSlotRank } from "./categorize";

const ARRAY_TAGS = new Set(["Item", "ItemSet", "Slot", "SkillSet", "Skill", "Gem"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as XmlNode)["#text"] ?? "");
  }
  return "";
}

function numAttr(node: XmlNode | undefined, key: string): number | undefined {
  if (!node) return undefined;
  const raw = node[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Gems live in the Skills section, not Items. Each `<Skill>` is one linked
 * socket group; we keep that grouping so users can scan setups by link.
 */
function parseGems(root: XmlNode): GemGroup[] {
  const skills = root.Skills as XmlNode | undefined;
  if (!skills) return [];

  const skillSets = asArray(skills.SkillSet as XmlNode | XmlNode[] | undefined);
  let skillNodes: XmlNode[];
  if (skillSets.length > 0) {
    const activeId = String(skills["@_activeSkillSet"] ?? "");
    const active =
      skillSets.find((s) => String(s["@_id"] ?? "") === activeId) ?? skillSets[0];
    skillNodes = asArray(active.Skill as XmlNode | XmlNode[] | undefined);
  } else {
    skillNodes = asArray(skills.Skill as XmlNode | XmlNode[] | undefined);
  }

  const groups: GemGroup[] = [];
  for (const skill of skillNodes) {
    const seen = new Set<string>();
    const gems: ParsedItem[] = [];
    for (const gem of asArray(skill.Gem as XmlNode | XmlNode[] | undefined)) {
      const name = String(gem["@_nameSpec"] ?? "").trim();
      if (!name) continue;
      const gemLevel = numAttr(gem, "@_level");
      const quality = numAttr(gem, "@_quality");
      const key = `${name}|${gemLevel ?? ""}|${quality ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      gems.push({
        raw: name,
        rarity: "gem",
        name,
        baseType: "Gem",
        category: "gem",
        gemLevel,
        quality,
        corrupted: false,
        mods: [],
        unparsed: [],
      });
    }
    if (gems.length === 0) continue;

    const slot = skill["@_slot"] ? String(skill["@_slot"]) : undefined;
    const explicitLabel = String(skill["@_label"] ?? "").trim();
    const activeGem = gems.find((g) => !/support/i.test(g.name));
    groups.push({
      label: explicitLabel || activeGem?.name || gems[0].name,
      slot,
      gems,
    });
  }
  return groups;
}

export function parseBuildXml(xml: string): ParsedBuild {
  const doc = parser.parse(xml) as Record<string, XmlNode>;

  const isPoe2 = "PathOfBuilding2" in doc;
  const game: GameId = isPoe2 ? "poe2" : "poe1";
  const root = (doc.PathOfBuilding2 ?? doc.PathOfBuilding) as XmlNode | undefined;
  if (!root) {
    throw new Error("Build XML has no PathOfBuilding root element.");
  }

  const buildNode = root.Build as XmlNode | undefined;
  const className = buildNode?.["@_className"] as string | undefined;
  const ascendancy = buildNode?.["@_ascendClassName"] as string | undefined;
  const level = numAttr(buildNode, "@_level");

  const itemsNode = root.Items as XmlNode | undefined;

  // Index every item's raw text by PoB id.
  const rawById = new Map<string, string>();
  if (itemsNode) {
    for (const itemNode of asArray(itemsNode.Item as XmlNode | XmlNode[] | undefined)) {
      const id = String((itemNode as XmlNode)["@_id"] ?? "");
      const text = textOf(itemNode);
      if (id && text.trim()) rawById.set(id, text);
    }
  }

  // Build-level items (jewels) + parse failures. Jewels are not in item-set slots.
  const jewels: ParsedItem[] = [];
  let skipped = 0;
  for (const text of rawById.values()) {
    const parsed = parseItemText(text);
    if (!parsed) {
      skipped++;
      continue;
    }
    if (parsed.category === "jewel") jewels.push(parsed);
  }

  const gems = parseGems(root);

  // One view per PoB item set ("version").
  const setNodes = asArray(itemsNode?.ItemSet as XmlNode | XmlNode[] | undefined);
  const activeItemSetId = String(
    itemsNode?.["@_activeItemSet"] ?? (setNodes[0]?.["@_id"] ?? "1"),
  );

  const views: ItemSetView[] = [];
  const sourceSets = setNodes.length > 0 ? setNodes : [undefined];

  for (const setNode of sourceSets) {
    const id = setNode ? String(setNode["@_id"] ?? "") : "1";
    const title = (setNode ? String(setNode["@_title"] ?? "") : "").trim();

    const gear: ParsedItem[] = [];
    const flasks: ParsedItem[] = [];
    const charms: ParsedItem[] = [];

    if (setNode) {
      for (const slot of asArray(setNode.Slot as XmlNode | XmlNode[] | undefined)) {
        const itemId = String(slot["@_itemId"] ?? "");
        const slotName = String(slot["@_name"] ?? "");
        if (!itemId || itemId === "0") continue;
        const text = rawById.get(itemId);
        if (!text) continue;
        const parsed = parseItemText(text, slotName);
        if (!parsed) continue;
        if (parsed.category === "flask") flasks.push(parsed);
        else if (parsed.category === "charm") charms.push(parsed);
        else if (parsed.category === "gear") gear.push(parsed);
      }
    }

    gear.sort((a, b) => gearSlotRank(a.slot) - gearSlotRank(b.slot));
    flasks.sort((a, b) => flaskRank(a.slot) - flaskRank(b.slot));

    views.push({
      id,
      title: title || `Set ${id}`,
      gear,
      jewels,
      gems,
      flasks,
      charms,
    });
  }

  return { game, className, ascendancy, level, itemSets: views, activeItemSetId, skipped };
}
