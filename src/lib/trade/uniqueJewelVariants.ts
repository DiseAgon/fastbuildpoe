import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";

export interface UniqueJewelVariantMatch {
  /** This stat selects the unique's actual variant, not merely one of its rolls. */
  defining: boolean;
  /** Discrete numeric variants must match their value exactly. */
  exactRoll: boolean;
}

const NONE: UniqueJewelVariantMatch = { defining: false, exactRoll: false };

const normalizedName = (name: string): string =>
  name.toLowerCase().replace(/[’`]/g, "'").trim();

const singleLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * PoE's trade data exposes some unique variants with a discriminator in the
 * stat id (`base-id|variant-id`), but several important jewels use ordinary
 * stat ids instead. Keep the name-specific rules here so a Watcher's Eye mod,
 * for example, becomes required without making its fixed life/mana/ES lines
 * required too.
 */
export function uniqueJewelVariant(
  game: GameId,
  item: ParsedItem,
  tradeStatText: string,
  statId: string,
): UniqueJewelVariantMatch {
  if (item.rarity !== "unique" || item.category !== "jewel") return NONE;

  // This is the trade API's native representation for a selected notable,
  // keystone, ring size, etc. It covers Forbidden Flame/Flesh, Impossible
  // Escape, Thread of Hope and future discriminator-backed stats.
  if (statId.includes("|")) return { defining: true, exactRoll: false };
  if (game !== "poe1") return NONE;

  const name = normalizedName(item.name);
  const text = singleLine(tradeStatText);

  switch (name) {
    case "the light of meaning":
    case "light of meaning":
    case "the perandus pact":
      return {
        defining: /^Passive Skills in Radius also grant\b/i.test(text),
        exactRoll: false,
      };

    case "watcher's eye":
      // The three maximum resource rolls are shared by every Watcher's Eye;
      // its aura-conditioned lines are the selected variants.
      return {
        defining: /\bwhile affected by\b/i.test(text),
        exactRoll: false,
      };

    case "sublime vision":
      // Every aura variant has one distinct disabling stat. Requiring this one
      // line identifies the aura without redundantly requiring all fixed lines.
      return {
        defining: /^Aura Skills other than .+ are Disabled$/i.test(text),
        exactRoll: false,
      };

    case "grand spectrum": {
      const defining = /\bper Grand Spectrum$/i.test(text);
      // Several legacy Grand Spectrum variants share a stat id and differ only
      // by their fixed number (e.g. 4/5/12/15% elemental damage).
      return { defining, exactRoll: defining };
    }

    case "voices": {
      const defining = /^Adds # Small Passive Skills? which grants? nothing$/i.test(text);
      // Lower is better and 1/3/5/7 are materially different variants, so a
      // percentage floor would be both backwards and ambiguous.
      return { defining, exactRoll: defining };
    }

    case "split personality":
      return {
        defining:
          /^\+# to (?:Strength|Dexterity|Intelligence|Accuracy Rating|Armour|Evasion Rating|maximum Energy Shield|maximum Life|maximum Mana)(?: \(Local\))?$/i.test(
            text,
          ),
        exactRoll: false,
      };

    case "megalomaniac":
      return {
        defining: /\bAdded Passive Skill is\b/i.test(text),
        exactRoll: false,
      };

    case "combat focus":
      // Crimson/Cobalt/Viridian share the same unique name. The disabled
      // element is the useful identity, independent of legacy damage rolls.
      return {
        defining: /\bPrismatic Skills cannot choose (?:Cold|Fire|Lightning)$/i.test(text),
        exactRoll: false,
      };

    case "forbidden flame":
    case "forbidden flesh":
      // Normally caught by the discriminator above. Keep a textual fallback
      // in case a future snapshot flattens those ids.
      return {
        defining: /matching modifier on Forbidden (?:Flame|Flesh)$/i.test(text),
        exactRoll: false,
      };

    case "that which was taken":
    case "bound by destiny":
      // These jewels are composed entirely of selected charm/incarnation mods;
      // their requirements/limits are item properties and never reach here.
      return { defining: true, exactRoll: false };

    default:
      return NONE;
  }
}
