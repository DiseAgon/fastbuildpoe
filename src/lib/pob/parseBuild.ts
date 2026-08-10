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

interface TreeJewelSpec {
  title: string;
  linkIds: string[];
  /** null means this spec predates `<Sockets>`; [] means it has no jewels. */
  jewels: ParsedItem[] | null;
}

interface TreeJewelContext {
  specs: TreeJewelSpec[];
  activeIndex: number;
}

/** PoB presents an untitled tree/item set as the `Default` loadout. */
function loadoutTitle(value: unknown): string {
  return String(value ?? "").trim() || "Default";
}

/** Resolve one passive-tree spec's socket references, preserving occurrences. */
function parseTreeSpecJewels(
  spec: XmlNode,
  rawById: Map<string, string>,
): ParsedItem[] | null {
  if (!("Sockets" in spec)) return null;
  const socketsNode = spec.Sockets;
  if (!socketsNode || typeof socketsNode !== "object") return [];

  const socketNodes = asArray(
    (socketsNode as XmlNode).Socket as XmlNode | XmlNode[] | undefined,
  ).sort((a, b) => {
    const aId = Number(a["@_nodeId"] ?? 0);
    const bId = Number(b["@_nodeId"] ?? 0);
    return aId - bId;
  });

  const jewels: ParsedItem[] = [];
  for (const socket of socketNodes) {
    const itemId = String(socket["@_itemId"] ?? "");
    if (!itemId || itemId === "0") continue;
    const text = rawById.get(itemId);
    if (!text) continue;

    const nodeId = String(socket["@_nodeId"] ?? "");
    // The slot is also how PoE2's Ruby/Emerald/Sapphire/Diamond bases are
    // distinguished from ordinary gear without relying on a brittle base list.
    const parsed = parseItemText(text, nodeId ? `Jewel ${nodeId}` : "Jewel");
    if (parsed?.category === "jewel") jewels.push(parsed);
  }
  return jewels;
}

/**
 * Parse every tree spec so an item-set/loadout can use its matching jewels.
 * PoB stores item definitions once under `<Items>`, then each socket references
 * one by id. The same item id may be used by several sockets, so the arrays
 * above deliberately preserve occurrences rather than deduplicating by id.
 */
function parseTreeJewelContext(
  root: XmlNode,
  rawById: Map<string, string>,
): TreeJewelContext | null {
  const tree = root.Tree as XmlNode | undefined;
  if (!tree) return null;

  const childSpecs = asArray(tree.Spec as XmlNode | XmlNode[] | undefined);
  const specNodes = childSpecs.length > 0 ? childSpecs : [tree];
  const requestedSpec = Number.parseInt(String(tree["@_activeSpec"] ?? "1"), 10);
  const activeIndex = Number.isFinite(requestedSpec)
    ? Math.min(specNodes.length - 1, Math.max(0, requestedSpec - 1))
    : 0;

  return {
    activeIndex,
    specs: specNodes.map((spec) => {
      const title = loadoutTitle(spec["@_title"]);
      const linkMatch = title.match(/\{([\w,]+)\}/);
      return {
        title,
        linkIds: linkMatch ? linkMatch[1].split(",") : [],
        jewels: parseTreeSpecJewels(spec, rawById),
      };
    }),
  };
}

/** Match PoB's loadout rule: active pair first, then title or `{linkId}`. */
function jewelsForItemSet(
  context: TreeJewelContext | null,
  setNode: XmlNode | undefined,
  activeItemSetId: string,
  legacyJewels: ParsedItem[],
): { jewels: ParsedItem[]; hasTreeSocketData: boolean } {
  if (!context || context.specs.length === 0) {
    return { jewels: legacyJewels, hasTreeSocketData: false };
  }

  const setId = setNode ? String(setNode["@_id"] ?? "") : "1";
  const setTitle = loadoutTitle(setNode?.["@_title"]);
  const setLinkMatch = setTitle.match(/\{([\w,]+)\}/);
  const setLinkIds = setLinkMatch ? setLinkMatch[1].split(",") : [];

  let selected = setId === activeItemSetId ? context.specs[context.activeIndex] : undefined;
  selected ??= context.specs.find((spec) => spec.title === setTitle);
  selected ??= context.specs.find((spec) =>
    spec.linkIds.some((id) => setLinkIds.includes(id)),
  );
  selected ??= context.specs[context.activeIndex];

  if (selected.jewels === null) {
    return { jewels: legacyJewels, hasTreeSocketData: false };
  }
  return { jewels: selected.jewels, hasTreeSocketData: true };
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
    /**
     * PoB lists skills an item or minion *grants* as skill groups too, tagged
     * with a `source` ("Item:28:Severed in Sleep" grants Envy). They are not
     * gems anyone can buy: no poe.ninja price, no artwork, and a trade link for
     * them searches for a base type that does not exist. Skip them — the item
     * granting the skill is already priced in its own slot.
     */
    if (String(skill["@_source"] ?? "").trim() !== "") continue;

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

  // Parse failures are counted over the item definitions. Keep a legacy jewel
  // list for old builds that have no passive-tree socket data at all.
  const legacyJewels: ParsedItem[] = [];
  let skipped = 0;
  for (const text of rawById.values()) {
    const parsed = parseItemText(text);
    if (!parsed) {
      skipped++;
      continue;
    }
    if (parsed.category === "jewel") legacyJewels.push(parsed);
  }

  const treeJewelContext = parseTreeJewelContext(root, rawById);

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
    const selectedJewels = jewelsForItemSet(
      treeJewelContext,
      setNode,
      activeItemSetId,
      legacyJewels,
    );

    const gear: ParsedItem[] = [];
    const jewels: ParsedItem[] = [...selectedJewels.jewels];
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
        // Abyss jewels live in gear sockets under the item set rather than in
        // passive-tree `<Sockets>`. Only add them here for modern builds; the
        // legacy all-items fallback already contains their item definitions.
        else if (parsed.category === "jewel" && selectedJewels.hasTreeSocketData) {
          jewels.push(parsed);
        }
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
