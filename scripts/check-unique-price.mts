/**
 * Unique name folding and row picking. Run:
 *   node --experimental-strip-types --no-warnings scripts/check-unique-price.mts
 */
import assert from "node:assert/strict";
import { norm, pickUniqueLine } from "../src/lib/market/priceIndex.ts";
import type { NinjaStashLine } from "../src/lib/market/ninja.ts";

assert.equal(norm("Doppelgänger Guise"), norm("Doppelganger Guise"));
assert.equal(norm("Doppelgänger Guise"), "doppelgangerguise");
assert.equal(norm("Mjölner"), norm("Mjolner"));
assert.equal(norm("Watcher's Eye"), "watcherseye");

const guise: NinjaStashLine[] = [
  { name: "Doppelgänger Guise", links: 6, chaosValue: 875, listingCount: 65, baseType: "Sadist Garb", explicitModifiers: [{ text: "(40-60)% more Critical Strike Chance while Insane" }] },
  { name: "Doppelgänger Guise", links: 5, chaosValue: 645, listingCount: 20, baseType: "Sadist Garb", explicitModifiers: [{ text: "(40-60)% more Critical Strike Chance while Insane" }] },
  { name: "Doppelgänger Guise", chaosValue: 400, listingCount: 164, baseType: "Sadist Garb", explicitModifiers: [{ text: "(40-60)% more Critical Strike Chance while Insane" }] },
];
const six = pickUniqueLine(guise, {
  links: 6,
  baseType: "Sadist Garb",
  mods: ["43% more Critical Strike Chance while Insane"],
});
assert.equal(six.line.chaosValue, 875);
assert.equal(six.approx, false);

const loose = pickUniqueLine(guise, { links: 0, baseType: "Sadist Garb" });
assert.equal(loose.line.chaosValue, 400);

const nightmare: NinjaStashLine[] = [
  {
    name: "Foulborn The Red Nightmare",
    chaosValue: 12803,
    listingCount: 4,
    variant: "Fire Lucky, Fire to Chaos",
    baseType: "Crimson Jewel",
    mutatedModifiers: [
      { text: "Fire Damage with Hits is Lucky if you've Blocked an Attack Recently" },
      { text: "Passives granting Fire Resistance or all Elemental Resistances in Radius\nalso grant Fire Damage Converted to Chaos Damage at 100% of its value" },
    ],
  },
  {
    name: "Foulborn The Red Nightmare",
    chaosValue: 863,
    listingCount: 46,
    variant: "Fire Lucky",
    baseType: "Crimson Jewel",
    explicitModifiers: [{ text: "Passives granting Fire Resistance or all Elemental Resistances in Radius\nalso grant Chance to Block Attack Damage at 50% of its value" }],
    mutatedModifiers: [{ text: "Fire Damage with Hits is Lucky if you've Blocked an Attack Recently" }],
  },
  {
    name: "Foulborn The Red Nightmare",
    chaosValue: 600,
    listingCount: 109,
    variant: "Fire to Chaos",
    baseType: "Crimson Jewel",
    explicitModifiers: [{ text: "Gain (6-10)% of Fire Damage as Extra Chaos Damage" }],
  },
];
const lucky = pickUniqueLine(nightmare, {
  links: 0,
  baseType: "Crimson Jewel",
  mods: [
    "Passives granting Fire Resistance or all Elemental Resistances in Radius",
    "also grant Chance to Block Attack Damage at 50% of its value",
    "Fire Damage with Hits is Lucky if you've Blocked an Attack Recently",
  ],
});
assert.equal(lucky.line.chaosValue, 863);
assert.equal(lucky.approx, false);

const boots: NinjaStashLine[] = [
  { name: "Doryani's Delusion", chaosValue: 30, listingCount: 218, baseType: "Leviathan Greaves" },
  { name: "Doryani's Delusion", chaosValue: 12, listingCount: 124, baseType: "Warlock Boots" },
];
assert.equal(
  pickUniqueLine(boots, { baseType: "Leviathan Greaves" }).line.chaosValue,
  30,
);

console.log("check-unique-price: ok");
