import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import type {
  BaseScope,
  EditableFilter,
  EquipmentFilter,
  FilterGroup,
  PseudoFilter,
  StatBand,
} from "./queryBuilder";
import type { SocketOptions } from "./socketOptions";

export interface SessionTradeSelection {
  filters: EditableFilter[];
  bandMins: Partial<Record<StatBand, number>>;
  equipment: EquipmentFilter[];
  pseudo: PseudoFilter[];
  buyout: boolean;
  baseScope: BaseScope;
  socket: SocketOptions;
}

export interface StoredTradeSelection {
  v: 2;
  roll: number;
  selection: SessionTradeSelection;
  /** Raw-mod groups temporarily hidden by selected pseudo replacements. */
  replacementGroups: Record<string, FilterGroup>;
}

const PREFIX = "fbp-trade-selection-v2:";
const LEGACY_PREFIXES = ["fbp-trade-selection-v1:"];

/** Compact deterministic identity without placing an entire PoB item in a key. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function storageKey(game: GameId, item: ParsedItem): string {
  const identity = [
    item.category,
    item.slot ?? "",
    item.name,
    item.baseType,
    item.vestigial ? "vestigial" : "",
    item.raw || JSON.stringify(item.mods),
  ].join("\0");
  return `${PREFIX}${game}:${fingerprint(identity)}`;
}

function validSocket(value: unknown): value is SocketOptions {
  if (!value || typeof value !== "object") return false;
  const socket = value as Record<string, unknown>;
  return ["links", "sockets", "runeSockets"].every(
    (key) =>
      socket[key] === null ||
      (typeof socket[key] === "number" && Number.isFinite(socket[key])),
  );
}

const FILTER_GROUPS: FilterGroup[] = ["and", "count", "not", "off"];

function validFilter(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const filter = value as Record<string, unknown>;
  return (
    typeof filter.statId === "string" &&
    typeof filter.text === "string" &&
    FILTER_GROUPS.includes(filter.group as FilterGroup)
  );
}

function validIncludeRow(value: unknown): boolean {
  return !!value && typeof value === "object" && typeof (value as { include?: unknown }).include === "boolean";
}

function validSelection(value: unknown): value is SessionTradeSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Record<string, unknown>;
  return (
    Array.isArray(selection.filters) && selection.filters.every(validFilter) &&
    Array.isArray(selection.equipment) && selection.equipment.every(validIncludeRow) &&
    Array.isArray(selection.pseudo) && selection.pseudo.every(validIncludeRow) &&
    !!selection.bandMins &&
    typeof selection.bandMins === "object" &&
    typeof selection.buyout === "boolean" &&
    ["exact", "slot", "any"].includes(String(selection.baseScope)) &&
    validSocket(selection.socket)
  );
}

export function loadTradeSelection(
  game: GameId,
  item: ParsedItem,
): StoredTradeSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(game, item));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTradeSelection>;
    if (
      parsed.v !== 2 ||
      typeof parsed.roll !== "number" ||
      !Number.isFinite(parsed.roll) ||
      !validSelection(parsed.selection) ||
      !parsed.replacementGroups ||
      typeof parsed.replacementGroups !== "object" ||
      !Object.values(parsed.replacementGroups).every((group) =>
        FILTER_GROUPS.includes(group as FilterGroup),
      )
    ) {
      return null;
    }
    return parsed as StoredTradeSelection;
  } catch {
    return null;
  }
}

export function saveTradeSelection(
  game: GameId,
  item: ParsedItem,
  roll: number,
  selection: SessionTradeSelection,
  replacementGroups: Map<string, FilterGroup>,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredTradeSelection = {
      v: 2,
      roll,
      selection,
      replacementGroups: Object.fromEntries(replacementGroups),
    };
    window.sessionStorage.setItem(storageKey(game, item), JSON.stringify(payload));
  } catch {
    /* unavailable or quota exceeded — trade settings remain usable in memory */
  }
}

/** Clear only one game's working trade settings; explicit Saved builds are separate. */
export function clearGameTradeSelections(game: GameId): void {
  if (typeof window === "undefined") return;
  try {
    const prefixes = [PREFIX, ...LEGACY_PREFIXES].map((prefix) => `${prefix}${game}:`);
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* clearing is best-effort when browser storage is unavailable */
  }
}
