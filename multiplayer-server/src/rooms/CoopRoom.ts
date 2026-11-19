import { BaseGameRoom } from "./BaseGameRoom.js";
import { CoopState, CoopPlayer } from "./schema/GameRoomState.js";
import type { RoomSettings } from "../shared/roomRules.js";

/** Co-op Survival: up to 4 players share one session. Shared zombies, weapons, pickups and revives are added in later stages. */
export class CoopRoom extends BaseGameRoom {
  readonly mode = "coop" as const;
  state = new CoopState();

  protected createPlayer(sessionId: string, name: string, slot: number) {
    return new CoopPlayer({ sessionId, name, slot, x: 0, y: 0, health: 100, maxHealth: 100, alive: true, ready: false, connected: true });
  }

  protected writeSettings(s: RoomSettings) {
    this.state.maxPlayers = s.maxPlayers; this.state.cityName = s.cityName; this.state.cityLat = s.cityLat; this.state.cityLng = s.cityLng;
    this.state.spawnArea = s.spawnArea; this.state.reviveSeconds = s.reviveSeconds;
  }

  protected readSettings(): RoomSettings {
    const st = this.state;
    return { maxPlayers: st.maxPlayers, cityName: st.cityName, cityLat: st.cityLat, cityLng: st.cityLng, spawnArea: st.spawnArea, reviveSeconds: st.reviveSeconds, matchMinutes: 10, friendlyFire: false };
  }
}
