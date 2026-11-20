import { schema, t, type SchemaType } from "@colyseus/schema";

const playerFields = {
  sessionId: t.string(),
  name: t.string(),
  slot: t.number(),
  x: t.number(),
  y: t.number(),
  /** Aim direction in radians, supplied by the owning client and range-normalized by the server. */
  angle: t.number(),
  health: t.number(),
  maxHealth: t.number(),
  alive: t.boolean(),
  ready: t.boolean(),
  connected: t.boolean(),
};
export const CoopPlayer = schema({ ...playerFields });
export type CoopPlayer = SchemaType<typeof CoopPlayer>;
export const CompetitivePlayer = schema({
  ...playerFields,
  score: t.number(),
  kills: t.number(),
  deaths: t.number(),
});
export type CompetitivePlayer = SchemaType<typeof CompetitivePlayer>;

const roomFields = {
  phase: t.string(),
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
