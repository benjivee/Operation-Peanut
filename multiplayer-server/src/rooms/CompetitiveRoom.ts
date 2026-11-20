import { BaseGameRoom } from "./BaseGameRoom.js";
import { CompetitiveState, CompetitivePlayer } from "./schema/GameRoomState.js";
import type { RoomSettings } from "../shared/roomRules.js";

export class CompetitiveRoom extends BaseGameRoom {
  readonly mode = "competitive" as const;
  state = new CompetitiveState();
  protected createPlayer(sessionId: string, name: string, slot: number) {
    return new CompetitivePlayer({ sessionId, name, slot, x: 0, y: 0, angle: 0, health: 100, maxHealth: 100, alive: true, ready: false, connected: true, score: 0, kills: 0, deaths: 0 });
  }
  protected writeSettings(s: RoomSettings) {
    this.state.maxPlayers = s.maxPlayers; this.state.cityName = s.cityName; this.state.cityLat = s.cityLat; this.state.cityLng = s.cityLng;
    this.state.spawnArea = s.spawnArea; this.state.matchMinutes = s.matchMinutes; this.state.friendlyFire = s.friendlyFire;
  }
  protected readSettings(): RoomSettings {
    const st = this.state;
    return { maxPlayers: st.maxPlayers, cityName: st.cityName, cityLat: st.cityLat, cityLng: st.cityLng, spawnArea: st.spawnArea, reviveSeconds: 6, matchMinutes: st.matchMinutes, friendlyFire: st.friendlyFire };
  }
}
