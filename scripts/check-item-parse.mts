/**
 * Parser checks for PoB 3.30 item text. Run:
 *   node --experimental-strip-types --no-warnings scripts/check-item-parse.mts
 */
import assert from "node:assert/strict";
import { parseItemText } from "../src/lib/pob/parseItemText.ts";

function modsOf(raw: string, slot?: string) {
  const item = parseItemText(raw, slot);
  assert.ok(item, "item parsed");
  return item;
}

const grouped = modsOf(`Rarity: UNIQUE
Example
Iron Ring
Version: Current
Version: Legacy
Selected Version: 1
Variant: Fire
Variant: Cold
Selected Variant Group: 1=2
{group:1}{variant:1}Ruby Ring
{group:1}{variant:2}Sapphire Ring
Quality: 20
Implicits: 2
{group:1}{variant:1}+10% to Fire Resistance
{group:1}{variant:2}+10% to Cold Resistance
{group:1}{variant:1}{version:1}Adds 5 to 10 Fire Damage
{group:1}{variant:2}{version:1}Adds 5 to 10 Cold Damage
{group:1}{variant:2}{version:2}Adds 1 to 2 Cold Damage
`);
assert.equal(grouped.baseType, "Sapphire Ring");
assert.equal(grouped.quality, 20);
assert.deepEqual(
  grouped.mods.map((m) => m.text),
  ["+10% to Cold Resistance", "Adds 5 to 10 Cold Damage"],
);
assert.equal(grouped.mods[0].type, "implicit");
assert.equal(grouped.mods[1].type, "explicit");

const classic = modsOf(`Rarity: UNIQUE
Mageblood
Heavy Belt
Selected Variant: 1
Has Alt Variant: true
Selected Alt Variant: 2
Implicits: 0
{variant:1}10% increased Flask Effect
{variant:2}15% increased Flask Effect
{variant:3}20% increased Flask Effect
`);
assert.deepEqual(
  classic.mods.map((m) => m.text),
  ["10% increased Flask Effect", "15% increased Flask Effect"],
);

const earlyBase = modsOf(`Rarity: UNIQUE
Name
Sapphire Ring
Item Level: 86
Selected Variant Group: 1=2
{group:1}{variant:1}Ruby Ring
{group:1}{variant:2}Sapphire Ring
Quality: 20
Implicits: 1
+30% to Cold Resistance
+80 to maximum Life
`);
assert.equal(earlyBase.baseType, "Sapphire Ring");
assert.equal(earlyBase.quality, 20);
assert.equal(earlyBase.itemLevel, 86);
assert.equal(earlyBase.mods[0].type, "implicit");
assert.equal(earlyBase.mods[0].text, "+30% to Cold Resistance");
assert.equal(earlyBase.mods[1].type, "explicit");

const escape = modsOf(`Rarity: UNIQUE
Impossible Escape
Viridian Jewel
League: Sentinel
Variant: Acrobatics
Variant: The Agnostic
Selected Variant: 2
Radius: Small
Limited to: 1
Implicits: 0
{variant:1}Passives in radius of Acrobatics can be allocated without being connected to your tree
{variant:2}Passives in radius of The Agnostic can be allocated without being connected to your tree
`);
assert.equal(escape.baseType, "Viridian Jewel");
assert.deepEqual(escape.mods.map((m) => m.text), [
  "Passives in radius of The Agnostic can be allocated without being connected to your tree",
]);

const colonName = modsOf(`
			Rarity: RARE
Leveling: minion wand
Calling Wand
Item Level: 25
Quality: 0
Implicits: 1
Minions deal 14% increased Damage
Minions deal 25% increased Damage
`);
assert.equal(colonName.name, "Leveling: minion wand");
assert.equal(colonName.baseType, "Calling Wand");
assert.equal(colonName.itemLevel, 25);
assert.equal(colonName.mods[0].type, "implicit");
assert.equal(colonName.mods.length, 2);

const rare = modsOf(`Rarity: RARE
Loath Cut
Vaal Regalia
Item Level: 84
Quality: 20
Implicits: 1
+12% to Cold Resistance
+50 to maximum Life
`);
assert.equal(rare.baseType, "Vaal Regalia");
assert.equal(rare.mods.length, 2);
assert.equal(rare.mods[0].type, "implicit");

const viscera = modsOf(
  `Item Class: Viscera
Flaming Furnace
Head
Take this to the Wickerman in a town or hideout to attach it.
+10% to Fire Resistance
`,
  "Wickerman Head",
);
assert.equal(viscera.rarity, "normal");
assert.equal(viscera.name, "Flaming Furnace");
assert.deepEqual(
  viscera.mods.map((m) => m.text),
  ["+10% to Fire Resistance"],
);

// PoB 3.30 item sets use the slot name "Head", and the label sits after Item Level.
const pobViscera = modsOf(
  `Rarity: NORMAL
Flaming Furnace
Item Level: 80
Head
+10% to Fire Resistance
Take this to the Wickerman in a town or hideout to attach it.
`,
  "Head",
);
assert.equal(pobViscera.name, "Flaming Furnace");
assert.equal(pobViscera.itemLevel, 80);
assert.deepEqual(
  pobViscera.mods.map((m) => m.text),
  ["+10% to Fire Resistance"],
);

const zwsp = modsOf(`Rarity: RARE
Name
Vaal Regalia
Implicits: 0
+50\u200b to maximum Life
`);
assert.equal(zwsp.mods[0].values[0], 50);
assert.equal(zwsp.mods[0].template, "# to maximum Life");

const doubled = modsOf(`Rarity: UNIQUE
Name
Iron Ring
Implicits: 0
+20 to maximum Life
Double Corrupted
`);
assert.equal(doubled.corrupted, true);
assert.equal(doubled.mods.length, 1);

console.log("check-item-parse: ok");
