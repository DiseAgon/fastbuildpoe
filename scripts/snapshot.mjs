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
  "staff", "sword", "oneswd", "twoswd", "onemace", "twomace", "oneaxe", "twoaxe",
];

function luaNum(block, key) {
  const m = block.match(new RegExp(`${key}\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

async function snapshotWeapons(game) {
  const repo = POB_REPO[game];
  const bases = {};
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
      const wm = chunk.match(/weapon\s*=\s*\{([^}]*)\}/);
      if (!wm) continue;
      const physMin = luaNum(wm[1], "PhysicalMin");
      const physMax = luaNum(wm[1], "PhysicalMax");
      const aps = luaNum(wm[1], "AttackRateBase");
      const crit = luaNum(wm[1], "CritChanceBase");
      if (physMin === null || physMax === null || aps === null) continue;
      bases[name] = { physMin, physMax, aps, crit: crit ?? 0 };
    }
  }
  writeFileSync(join(OUT, `weapons.${game}.json`), JSON.stringify(bases));
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

for (const [game, base] of Object.entries(GAMES)) {
  // Stats → flattened {id, text, type}
  const stats = await getJson(`${base}/data/stats`);
  const entries = (stats.result ?? []).flatMap((g) => g.entries ?? []).map((e) => ({
    id: e.id,
    text: e.text,
    type: e.type,
  }));
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
  console.log(
    `${game}: ${entries.length} stats, ${leagues.length} leagues, divine=${!!divineIcon}, ${weaponCount} weapon bases`,
  );
}
