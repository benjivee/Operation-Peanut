import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * State for the two multiplayer game modes. Kept separate from MyRoomState (which stays untouched as the working reference).
 *
 * Positions are in the game's own world coordinates. The server does not own a map: x / y start at 0 and are filled in by later stages
 * (when the real Operation Peanut world is shared). Flat primitives + one map only, the same shapes MyRoomState already uses.
 */
const playerFields = {
  sessionId: t.string(),
  name: t.string(),
  /** Seat number 0..3, stable for the whole stay (also used to pick a colour / spawn offset later). */
  slot: t.number(),
  x: t.number(),
  y: t.number(),
  health: t.number(),
  maxHealth: t.number(),
  alive: t.boolean(),
  ready: t.boolean(),
  /** false while the seat is held for a dropped player (they may reconnect). */
  connected: t.boolean(),
};

/** Co-op player: the base fields. (Revive state will be added here in the co-op stage.) */
export const CoopPlayer = schema({ ...playerFields });
export type CoopPlayer = SchemaType<typeof CoopPlayer>;

/** Competitive player: the base fields plus the numbers a leaderboard will need. Nothing updates them yet. */
export const CompetitivePlayer = schema({
  ...playerFields,
  score: t.number(),
  kills: t.number(),
  deaths: t.number(),
});
export type CompetitivePlayer = SchemaType<typeof CompetitivePlayer>;

const roomFields = {
  /** "lobby" until a match starts (a later stage), then "playing" / "ended". */
  phase: t.string(),
  /** Session id of the host: the only player who may change settings. */
  hostId: t.string(),
  mode: t.string(),
  maxPlayers: t.number(),
  cityName: t.string(),
  cityLat: t.number(),
  cityLng: t.number(),
  spawnArea: t.string(),
};

export const CoopState = schema({
  ...roomFields,
  reviveSeconds: t.number(),
  players: t.map(CoopPlayer),
});
export type CoopState = SchemaType<typeof CoopState>;

export const CompetitiveState = schema({
  ...roomFields,
  matchMinutes: t.number(),
  friendlyFire: t.boolean(),
  players: t.map(CompetitivePlayer),
});
export type CompetitiveState = SchemaType<typeof CompetitiveState>;
