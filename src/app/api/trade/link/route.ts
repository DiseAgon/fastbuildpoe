import { NextResponse } from "next/server";
import { z } from "zod";
import { isGameId } from "@/lib/game/registry";
import { buildItemQuery, type BudgetMode } from "@/lib/trade/queryBuilder";
import { resolveLeague } from "@/lib/trade/league";
import { buildTradeUrl } from "@/lib/trade/tradeLink";
import type { ParsedItem } from "@/types/item";

export const runtime = "nodejs";

const ModSchema = z.object({
  text: z.string(),
  template: z.string(),
  values: z.array(z.number()),
  type: z.enum([
    "implicit",
    "explicit",
    "crafted",
    "fractured",
    "enchant",
    "scourge",
    "unknown",
  ]),
});

const ItemSchema = z.object({
  rarity: z.enum(["normal", "magic", "rare", "unique", "gem", "currency"]),
  name: z.string(),
  baseType: z.string(),
  category: z.enum(["gear", "jewel", "gem", "flask", "charm"]),
  gemLevel: z.number().optional(),
  quality: z.number().optional(),
  corrupted: z.boolean().optional().default(false),
  defences: z
    .object({
      armour: z.number().optional(),
      evasion: z.number().optional(),
      energyShield: z.number().optional(),
      ward: z.number().optional(),
    })
    .optional(),
  mods: z.array(ModSchema),
});

const FilterSchema = z.object({
  statId: z.string(),
  text: z.string(),
  currentRoll: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  group: z.enum(["and", "count", "not", "off"]),
  fractured: z.boolean().optional().default(false),
  fracturedStatId: z.string().nullable().optional().default(null),
});

const EquipmentSchema = z.object({
  field: z.string(),
  label: z.string(),
  group: z.enum(["armour", "weapon"]),
  itemValue: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  include: z.boolean(),
});

const PseudoSchema = z.object({
  statId: z.string(),
  label: z.string(),
  itemValue: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  include: z.boolean(),
});

const RequestBody = z.object({
  game: z.string().refine(isGameId, "Unknown game."),
  mode: z.enum(["minmax", "asis", "budget"]),
  league: z.string().optional(),
  item: ItemSchema,
  countMin: z.number().optional(),
  filters: z.array(FilterSchema).optional(),
  equipment: z.array(EquipmentSchema).optional(),
  pseudo: z.array(PseudoSchema).optional(),
  buyout: z.boolean().optional(),
  useBase: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { game, mode } = parsed.data;
  // The validated item satisfies the fields buildItemQuery reads.
  const item = parsed.data.item as ParsedItem;

  try {
    const overrides = {
      filters: parsed.data.filters,
      countMin: parsed.data.countMin,
      equipment: parsed.data.equipment,
      pseudo: parsed.data.pseudo,
      buyout: parsed.data.buyout,
      useBase: parsed.data.useBase,
    };
    const [resolvedLeague, built] = await Promise.all([
      parsed.data.league
        ? Promise.resolve(parsed.data.league)
        : resolveLeague(game as Parameters<typeof resolveLeague>[0]),
      buildItemQuery(game as Parameters<typeof buildItemQuery>[0], item, mode as BudgetMode, overrides),
    ]);
    const league = resolvedLeague;
    const url = buildTradeUrl(game as Parameters<typeof buildTradeUrl>[0], league, built.query);
    return NextResponse.json({
      success: true,
      data: {
        url,
        league,
        matched: built.matched,
        unmatched: built.unmatched,
        countMin: built.countMin,
        filters: built.filters,
        equipment: built.equipment,
        pseudo: built.pseudo,
        useBase: built.useBase,
        strategy: built.strategy,
      },
      error: null,
    });
  } catch (error) {
    console.error("[trade/link] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to build link.";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
