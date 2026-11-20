import { performance } from "node:perf_hooks";
import { Room, Client, CloseCode } from "colyseus";
import {
  type GameMode, type RoomSettings, DEFAULT_SETTINGS, MAX_PLAYERS_PER_ROOM, RECONNECT_SECONDS,
  mergeSettings, sanitizeName, uniqueName, defaultName, lowestFreeSlot, chooseNextHost,
} from "../shared/roomRules.js";
import { PHASE_LOBBY, PHASE_PLAYING, validateStart } from "../shared/matchRules.js";
import { MovementGate } from "../shared/movementRules.js";

/** Shared lobby, match-start and movement foundation for both multiplayer modes. */
export abstract class BaseGameRoom extends Room<{ state: any }> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  abstract readonly mode: GameMode;
  protected abstract createPlayer(sessionId: string, name: string, slot: number): any;
  protected abstract writeSettings(settings: RoomSettings): void;
  protected abstract readSettings(): RoomSettings;
  private readonly moveGate = new MovementGate();

  messages = {
    ready: (client: Client, message: any) => this.onReadyMessage(client, message),
    settings: (client: Client, message: any) => this.onSettingsMessage(client, message),
    name: (client: Client, message: any) => this.onNameMessage(client, message),
    start: (client: Client) => this.onStartMessage(client),
    move: (client: Client, message: any) => this.onMoveMessage(client, message),
  };

  onCreate(options: any) {
    const settings = mergeSettings(options, this.mode, DEFAULT_SETTINGS, 0);
    this.state.mode = this.mode;
    this.state.phase = PHASE_LOBBY;
    this.state.hostId = "";
    this.writeSettings(settings);
    this.maxClients = settings.maxPlayers;
    this.updateMetadata();
  }

  onJoin(client: Client, options: any) {
    if (this.state.phase !== PHASE_LOBBY) throw new Error("This match has already started");
    if (this.state.players.size >= Math.min(this.state.maxPlayers, MAX_PLAYERS_PER_ROOM)) throw new Error("This room is full");
    const taken = this.playerList().map((p) => p.name);
    const name = uniqueName(sanitizeName(options?.name) || defaultName(), taken);
    const slot = lowestFreeSlot(this.playerList().map((p) => p.slot));
    if (slot < 0) throw new Error("This room is full");
    this.state.players.set(client.sessionId, this.createPlayer(client.sessionId, name, slot));
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.updateMetadata();
    console.log(`[${this.mode}] ${client.sessionId} joined as "${name}" (seat ${slot + 1}, ${this.state.players.size}/${this.state.maxPlayers})`);
  }

  onLeave(client: Client, code: CloseCode) {
    this.state.players.delete(client.sessionId);
    this.moveGate.forget(client.sessionId);
    if (this.state.hostId === client.sessionId) this.state.hostId = chooseNextHost(this.playerList());
    this.updateMetadata();
    console.log(`[${this.mode}] ${client.sessionId} left (${code}), ${this.state.players.size} remain`);
  }

  onDrop(client: Client, code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => { /* onLeave handles expired seats */ });
    this.updateMetadata();
    console.log(`[${this.mode}] ${client.sessionId} dropped (${code}), holding seat for ${RECONNECT_SECONDS}s`);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.updateMetadata();
    console.log(`[${this.mode}] ${client.sessionId} reconnected`);
  }

  onDispose() { console.log(`[${this.mode}] room ${this.roomId} disposing...`); }

  private onReadyMessage(client: Client, message: any) {
    if (this.state.phase !== PHASE_LOBBY) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = typeof message?.ready === "boolean" ? message.ready : !player.ready;
  }

  private onSettingsMessage(client: Client, message: any): void {
    if (client.sessionId !== this.state.hostId) return void client.send("error", { code: "not_host", message: "Only the host can change room settings" });
    if (this.state.phase !== PHASE_LOBBY) return void client.send("error", { code: "not_lobby", message: "Settings can only change in the lobby" });
    const next = mergeSettings(message, this.mode, this.readSettings(), this.state.players.size);
    this.writeSettings(next);
    this.maxClients = next.maxPlayers;
    this.updateMetadata();
  }

  private onNameMessage(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const clean = sanitizeName(message?.name);
    if (!clean) return;
    player.name = uniqueName(clean, this.playerList().filter((p) => p.sessionId !== client.sessionId).map((p) => p.name));
    this.updateMetadata();
  }

  private onStartMessage(client: Client): void {
    const players = this.playerList();
    const result = validateStart({
      requesterId: client.sessionId,
      hostId: this.state.hostId,
      phase: this.state.phase,
      players,
      world: {
        cityName: this.state.cityName,
        cityLat: this.state.cityLat,
        cityLng: this.state.cityLng,
        spawnArea: this.state.spawnArea,
      },
    });
    if (!result.ok) {
      client.send("error", { code: result.code, message: result.message });
      return;
    }

    this.state.phase = PHASE_PLAYING;
    this.moveGate.resetAll();
    this.updateMetadata();
    // lock() prevents additional clients from joining after the match starts.
    void this.lock().catch((error: unknown) => console.error("Failed to lock started room", error));
    this.broadcast("match_started", {
      mode: this.mode,
      cityName: this.state.cityName,
      cityLat: this.state.cityLat,
      cityLng: this.state.cityLng,
      spawnArea: this.state.spawnArea,
    });
  }

  private onMoveMessage(client: Client, message: any): void {
    if (this.state.phase !== PHASE_PLAYING) return;
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected) return;
    const decision = this.moveGate.evaluate(
      client.sessionId,
      message,
      { x: player.x, y: player.y, angle: player.angle },
      performance.now(),
    );
    if (decision.kind !== "apply") return;
    player.x = decision.x;
    player.y = decision.y;
    if (decision.angle !== undefined) player.angle = decision.angle;
  }

  protected playerList(): any[] {
    const out: any[] = [];
    this.state.players.forEach((p: any) => out.push(p));
    return out;
  }

  protected updateMetadata() {
    const host = this.state.players.get(this.state.hostId);
    this.setMetadata({
      mode: this.mode, maxPlayers: this.state.maxPlayers, players: this.state.players.size,
      cityName: this.state.cityName, spawnArea: this.state.spawnArea,
      hostName: host ? host.name : "", phase: this.state.phase,
    });
  }
}
