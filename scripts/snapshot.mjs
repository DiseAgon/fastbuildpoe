/**
 * Snapshot PoE trade data (stats, leagues, divine icon) into src/data/poe/ so the
 * deployed app works without live-fetching Cloudflare-protected endpoints at
 * runtime (datacenter IPs get blocked). Re-run when a new league starts.
 *
 *   node scripts/snapshot.mjs
 *
 * See DATA_SOURCES.md.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "data", "poe");
mkdirSync(OUT, { recursive: true });

const UA = "FastBuildPOE/0.1 (+snapshot)";
const HEADERS = { "User-Agent": UA, Accept: "application/json" };
const CDN = "https://web.poecdn.com";

const GAMES = {
  poe1: "https://www.pathofexile.com/api/trade",
  poe2: "https://www.pathofexile.com/api/trade2",
};

const POB_REPO = {
  poe1: "PathOfBuildingCommunity/PathOfBuilding",
  poe2: "PathOfBuildingCommunity/PathOfBuilding-PoE2",
};
const WEAPON_FILES = [
  "axe", "bow", "claw", "crossbow", "dagger", "flail", "mace", "spear",
  "staff", "sword", "wand", "oneswd", "twoswd", "onemace", "twomace", "oneaxe", "twoaxe",
];

function luaNum(block, key) {
  const m = block.match(new RegExp(`${key}\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

const TRADE_CATEGORY_BY_CLASS = {
  Bow: "weapon.bow",
  Claw: "weapon.claw",
  Crossbow: "weapon.crossbow",
  Dagger: "weapon.dagger",
  Flail: "weapon.flail",
  Spear: "weapon.spear",
  Wand: "weapon.wand",
  "One Handed Axe": "weapon.oneaxe",
  "One Hand Axe": "weapon.oneaxe",
  "Two Handed Axe": "weapon.twoaxe",
  "Two Hand Axe": "weapon.twoaxe",
  "One Handed Mace": "weapon.onemace",
  "One Hand Mace": "weapon.onemace",
  "Two Handed Mace": "weapon.twomace",
  "Two Hand Mace": "weapon.twomace",
  "One Handed Sword": "weapon.onesword",
  "One Hand Sword": "weapon.onesword",
  "Two Handed Sword": "weapon.twosword",
  "Two Hand Sword": "weapon.twosword",
  Sceptre: "weapon.sceptre",
};

function weaponTradeCategory(itemClass, itemSubClass) {
  // These trade categories are encoded as PoB subtypes rather than top-level
  // classes. This is what distinguishes Staff/Warstaff, Dagger/Rune Dagger and
  // Sword/Thrusting Sword without guessing from a base name.
  if (itemSubClass === "Warstaff") return "weapon.warstaff";
  if (itemSubClass === "Rune Dagger") return "weapon.runedagger";
  if (itemSubClass === "Thrusting") return "weapon.rapier";
  if (itemClass === "Staff") return "weapon.staff";
  return TRADE_CATEGORY_BY_CLASS[itemClass] ?? null;
}

async function snapshotWeapons(game) {
  const repo = POB_REPO[game];
  const bases = {};
  const classes = {};
  for (const file of WEAPON_FILES) {
    let text;
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${repo}/dev/src/Data/Bases/${file}.lua`,
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue;
    }
    for (const chunk of text.split('itemBases["').slice(1)) {
      const nameEnd = chunk.indexOf('"]');
      if (nameEnd === -1) continue;
      const name = chunk.slice(0, nameEnd);
      const itemClass = chunk.match(/\btype\s*=\s*"([^"]+)"/)?.[1];
      const itemSubClass = chunk.match(/\bsubType\s*=\s*"([^"]+)"/)?.[1];
      const wm = chunk.match(/weapon\s*=\s*\{([^}]*)\}/);
      if (!itemClass) continue;
      const tradeCategory = weaponTradeCategory(itemClass, itemSubClass);
      if (!tradeCategory) {
        console.warn(`${game}: unknown weapon class ${itemClass} (${name})`);
        continue;
      }
      classes[name] = { itemClass, ...(itemSubClass ? { itemSubClass } : {}), tradeCategory };
      // Spell-only Staff/Wand bases still need class metadata for a slot search,
      // but have no local attack stats and therefore no DPS record.
      if (!wm) continue;
      const physMin = luaNum(wm[1], "PhysicalMin");
      const physMax = luaNum(wm[1], "PhysicalMax");
      const aps = luaNum(wm[1], "AttackRateBase");
      const crit = luaNum(wm[1], "CritChanceBase");
      if (physMin === null || physMax === null || aps === null) continue;
      bases[name] = {
        physMin,
        physMax,
        aps,
        crit: crit ?? 0,
        itemClass,
        ...(itemSubClass ? { itemSubClass } : {}),
        tradeCategory,
      };
    }
  }
  writeFileSync(join(OUT, `weapons.${game}.json`), JSON.stringify(bases));
  writeFileSync(join(OUT, `weaponclasses.${game}.json`), JSON.stringify(classes));
  return Object.keys(bases).length;
}

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function pickDefaultLeague(leagues) {
  return leagues.find((l) => !/hardcore|ruthless|standard|ssf|\bhc\b/i.test(l)) ?? leagues[0] ?? "Standard";
}

const weaponsOnly = process.argv.includes("--weapons-only");

if (weaponsOnly) {
  for (const game of Object.keys(GAMES)) {
    const weaponCount = await snapshotWeapons(game);
    console.log(`${game}: ${weaponCount} weapon bases`);
  }
  process.exit(0);
}

for (const [game, base] of Object.entries(GAMES)) {
  // Stats → flattened {id, text, type}
  const stats = await getJson(`${base}/data/stats`);
  const entries = (stats.result ?? []).flatMap((g) => g.entries ?? []).map((e) => {
    const entry = { id: e.id, text: e.text, type: e.type };
    // Keep discrete options for option-valued stats (e.g. "… in # Ring") so the
    // matcher can expand them into concrete texts and emit `value.option`.
    const options = e.option?.options;
    if (Array.isArray(options) && options.length > 0) {
      entry.options = options
        .filter((o) => o && o.id !== undefined && o.text)
        .map((o) => ({ id: o.id, text: String(o.text) }));
    }
    return entry;
  });
  writeFileSync(join(OUT, `stats.${game}.json`), JSON.stringify(entries));

  // Leagues (deduped) + default
  const leaguesRaw = await getJson(`${base}/data/leagues`);
  const leagues = [...new Set((leaguesRaw.result ?? []).map((l) => l.id).filter(Boolean))];

  // Divine icon from static
  let divineIcon = null;
  try {
    const stat = await getJson(`${base}/data/static`);
    for (const g of stat.result ?? []) {
      for (const e of g.entries ?? []) {
        if (e.id === "divine" && e.image) divineIcon = e.image.startsWith("http") ? e.image : CDN + e.image;
      }
    }
  } catch {}

  writeFileSync(
    join(OUT, `meta.${game}.json`),
    JSON.stringify({ leagues, defaultLeague: pickDefaultLeague(leagues), divineIcon }, null, 0),
  );

  const weaponCount = await snapshotWeapons(game);

  /**
   * Searchable gem entries, kept whole rather than reduced to `type` names.
   *
   * Transfigured gems share their base gem's `type` and are selected by a
   * discriminator: "Cyclone of Tumult" is `{type: "Cyclone", disc: "alt_x"}`.
   * Flattening to `type` collapsed all 263 of them onto their base gem, so the
   * app could neither recognise nor search a transfigured skill.
   */
  let gemEntries = [];
  try {
    const items = await getJson(`${base}/data/items`);
    gemEntries = (items.result ?? [])
      .filter((g) => /gem/i.test(g.label ?? ""))
      .flatMap((g) => g.entries ?? [])
      .filter((e) => e.type)
      .map((e) => (e.disc ? { type: e.type, text: e.text ?? e.type, disc: e.disc } : { type: e.type }));
  } catch {}
  writeFileSync(join(OUT, `gemtypes.${game}.json`), JSON.stringify(gemEntries));

  const discCount = gemEntries.filter((e) => e.disc).length;
  console.log(
    `${game}: ${entries.length} stats, ${leagues.length} leagues, divine=${!!divineIcon}, ${weaponCount} weapon bases, ${gemEntries.length} gem entries (${discCount} transfigured)`,
  );
}
