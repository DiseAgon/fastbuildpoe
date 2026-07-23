/**
 * Regenerates src/data/poe/cxNames.json — a map from GGG metadata item ids
 * (as used by the official currency-exchange API) to display names.
 *
 * Sources:
 *  - RePoE fork base_items dump (metadata id → official item name)
 *  - the last 24 hourly digests of the official exchange API (which ids are
 *    actually traded — keeps the committed file small)
 *
 * Existing entries are preserved even if an id stops trading, so the map only
 * ever grows. Run via `node scripts/cx-names.mjs` (also from the snapshot CI).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const UA = { "User-Agent": "FastBuildPOE/0.1 (+https://fastbuildpoe.xyz)" };
const OUT = resolve(process.cwd(), "src/data/poe/cxNames.json");
const BASE_ITEMS_URLS = [
  "https://repoe-fork.github.io/base_items.min.json",
  "https://lvlvllvlvllvlvl.github.io/RePoE/base_items.min.json",
];
const CX = "https://web.poecdn.com/api/currency-exchange";
const HOURS_BACK = 24;

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function loadBaseItems() {
  for (const url of BASE_ITEMS_URLS) {
    try {
      return await getJson(url);
    } catch (err) {
      console.warn(`base_items source failed: ${err.message}`);
    }
  }
  throw new Error("all base_items sources failed");
}

function loadExisting() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return {};
  }
}

const baseItems = await loadBaseItems();
const names = loadExisting();
const before = Object.keys(names).length;

const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
const ids = new Set();
for (let k = 1; k <= HOURS_BACK; k++) {
  const hourId = currentHour - k * 3600;
  try {
    const digest = await getJson(`${CX}/${hourId}`);
    for (const market of digest.markets ?? []) {
      for (const id of market.market_pair ?? []) ids.add(id);
    }
  } catch {
    // 404 for the current hour / pruned history is expected — skip.
  }
}

let unmapped = 0;
for (const id of ids) {
  if (names[id]) continue;
  const name = baseItems[id]?.name;
  if (name) names[id] = name;
  else unmapped++;
}

writeFileSync(OUT, `${JSON.stringify(names, null, 1)}\n`);
console.log(
  `cxNames.json: ${Object.keys(names).length} entries (+${Object.keys(names).length - before} new, ${unmapped} unmapped of ${ids.size} traded ids)`,
);
