import type { GameMode } from "./roomRules.js";

export const PHASE_LOBBY = "lobby";
export const PHASE_PLAYING = "playing";

export interface StartPlayer {
  sessionId: string;
  ready: boolean;
  connected: boolean;
}
export interface StartWorld {
  cityName: string;
  cityLat: number;
  cityLng: number;
  spawnArea: string;
}
export interface StartCheckInput {
  requesterId: string;
  hostId: string;
  phase: string;
  players: StartPlayer[];
  world: StartWorld;
}
export interface StartCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export function isValidWorld(world: StartWorld): boolean {
  return typeof world.cityName === "string" && world.cityName.trim().length > 0 &&
    world.cityName.length <= 80 &&
    Number.isFinite(world.cityLat) && world.cityLat >= -90 && world.cityLat <= 90 &&
    Number.isFinite(world.cityLng) && world.cityLng >= -180 && world.cityLng <= 180 &&
    !(world.cityLat === 0 && world.cityLng === 0) &&
    typeof world.spawnArea === "string" && /^[a-z0-9_-]{1,24}$/.test(world.spawnArea);
}

export function validateStart(input: StartCheckInput): StartCheckResult {
  if (!input.requesterId || input.requesterId !== input.hostId) return { ok: false, code: "not_host", message: "Only the host can start the match" };
  if (input.phase !== PHASE_LOBBY) return { ok: false, code: "not_lobby", message: "The match is not in the lobby" };
  const host = input.players.find((p) => p.sessionId === input.hostId && p.connected);
  if (!host) return { ok: false, code: "host_missing", message: "The host is not connected" };
  const connected = input.players.filter((p) => p.connected);
  if (connected.length < 2) return { ok: false, code: "not_enough_players", message: "At least 2 connected players are required" };
  const waiting = connected.find((p) => p.sessionId !== input.hostId && !p.ready);
  if (waiting) return { ok: false, code: "players_not_ready", message: "All other players must be ready" };
  if (!isValidWorld(input.world)) return { ok: false, code: "world_not_selected", message: "Choose a city and spawn area before starting" };
  return { ok: true };
}
