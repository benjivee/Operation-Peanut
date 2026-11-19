/**
 * Room rules shared by the co-op and competitive rooms.
 *
 * Everything here is plain TypeScript with NO Colyseus imports, on purpose: it is the part that decides what a client is allowed to ask for
 * (names, room settings, the 4-player cap, who becomes host), so it can be unit-tested without booting a server.
 * Nothing a client sends is trusted: every value is validated, clamped or replaced by a default.
 */
export type GameMode = "coop" | "competitive";

/** Hard cap for every room. A client can ask for fewer players, never more. */
export const MAX_PLAYERS_PER_ROOM = 4;
export const MIN_PLAYERS_PER_ROOM = 2;
/** How long a dropped player's seat is held (seconds). */
export const RECONNECT_SECONDS = 30;

export const NAME_MAX_LENGTH = 14;
export const CITY_NAME_MAX_LENGTH = 80;
export const SPAWN_AREA_MAX_LENGTH = 24;

export interface RoomSettings {
  maxPlayers: number;
  /** The city the host picked (name + position); empty / 0,0 until a map is chosen. The server never invents a map. */
  cityName: string;
  cityLat: number;
  cityLng: number;
  /** The spawn area key the host picked in the game's city flow (e.g. "downtown"). Free-form but restricted to a safe character set. */
  spawnArea: string;
  /** Co-op only: seconds a teammate needs to revive a downed player (used in a later stage). */
  reviveSeconds: number;
  /** Competitive only (used in a later stage). */
  matchMinutes: number;
  friendlyFire: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: MAX_PLAYERS_PER_ROOM, cityName: "", cityLat: 0, cityLng: 0, spawnArea: "",
  reviveSeconds: 6, matchMinutes: 10, friendlyFire: true,
};
export const ALLOWED_MATCH_MINUTES = [5, 10, 15, 20];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A player name: letters / digits / space / a few symbols, trimmed, at most 14 characters. Empty means "use the fallback". */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^\p{L}\p{N} _.!-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
}

/** Make a name unique within the room by adding a number: "Sam" -> "Sam 2". Case-insensitive. */
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const suffix = " " + i, candidate = name.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return name.slice(0, NAME_MAX_LENGTH - 3) + " " + Math.floor(100 + Math.random() * 900);
}

export function defaultName(): string { return "Peanut" + Math.floor(100 + Math.random() * 900); }

const cleanCity = (v: unknown): string | undefined => typeof v === "string" ? v.replace(/[^\p{L}\p{N} .,'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, CITY_NAME_MAX_LENGTH) : undefined;
const cleanArea = (v: unknown): string | undefined => typeof v === "string" ? v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, SPAWN_AREA_MAX_LENGTH) : undefined;
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const int = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);

/**
 * Turn untrusted input into a complete, valid RoomSettings. Used for BOTH room creation options and host updates:
 *  - `base` is the current settings (defaults for a new room); only keys that are present AND valid change it.
 *  - maxPlayers is clamped to 2..4 and can never drop below `playerCount` (reducing the limit never kicks anyone out).
 *  - The game mode is NOT a setting: it is fixed by which room type was created, so a client cannot switch it.
 */
export function mergeSettings(input: unknown, mode: GameMode, base: RoomSettings = DEFAULT_SETTINGS, playerCount = 0): RoomSettings {
  const s: RoomSettings = { ...base };
  if (!isObject(input)) return { ...s, maxPlayers: Math.max(s.maxPlayers, Math.min(playerCount, MAX_PLAYERS_PER_ROOM)) };
  const mp = int(input.maxPlayers, MIN_PLAYERS_PER_ROOM, MAX_PLAYERS_PER_ROOM); if (mp !== undefined) s.maxPlayers = mp;
  s.maxPlayers = Math.max(s.maxPlayers, Math.min(playerCount, MAX_PLAYERS_PER_ROOM));
  const city = cleanCity(input.cityName); if (city !== undefined) s.cityName = city;
  const lat = num(input.cityLat, -90, 90), lng = num(input.cityLng, -180, 180); if (lat !== undefined && lng !== undefined) { s.cityLat = lat; s.cityLng = lng; }
  const area = cleanArea(input.spawnArea); if (area !== undefined) s.spawnArea = area;
  if (mode === "coop") { const r = int(input.reviveSeconds, 3, 15); if (r !== undefined) s.reviveSeconds = r; }
  else {
    if (typeof input.matchMinutes === "number" && ALLOWED_MATCH_MINUTES.includes(input.matchMinutes)) s.matchMinutes = input.matchMinutes;
    if (typeof input.friendlyFire === "boolean") s.friendlyFire = input.friendlyFire;
  }
  return s;
}

/** The lowest seat number (0..max-1) nobody is using, or -1 if the room is full. */
export function lowestFreeSlot(used: number[], max = MAX_PLAYERS_PER_ROOM): number {
  for (let i = 0; i < max; i++) if (!used.includes(i)) return i;
  return -1;
}

/** Who becomes host when the host leaves: the lowest seat among players who are connected, else the lowest seat. Returns "" for an empty room. */
export function chooseNextHost(players: { sessionId: string; slot: number; connected: boolean }[]): string {
  if (!players.length) return "";
  const sorted = [...players].sort((a, b) => a.slot - b.slot);
  return (sorted.find((p) => p.connected) || sorted[0]).sessionId;
}
