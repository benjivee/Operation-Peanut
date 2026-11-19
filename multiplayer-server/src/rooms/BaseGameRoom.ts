import { Room, Client, CloseCode } from "colyseus";
import {
  type GameMode, type RoomSettings, DEFAULT_SETTINGS, MAX_PLAYERS_PER_ROOM, RECONNECT_SECONDS,
  mergeSettings, sanitizeName, uniqueName, defaultName, lowestFreeSlot, chooseNextHost,
} from "../shared/roomRules.js";

/**
 * Everything the co-op and competitive rooms have in common: the 4-player cap, seats (slots), host, ready flags, validated settings,
 * leaving, unexpected disconnects and reconnection. The two room classes only say which state class they use and what extra fields they have.
 *
 * Deliberately NOT here (later stages): zombies, weapons, bullets, combat, scoring, the shared map, starting a match.
 */
export abstract class BaseGameRoom extends Room<{ state: any }> {
  /** The framework's hard seat limit. onCreate lowers it to the host's choice, never above 4. */
  maxClients = MAX_PLAYERS_PER_ROOM;

  abstract readonly mode: GameMode;
  /** Build this mode's player schema object. */
  protected abstract createPlayer(sessionId: string, name: string, slot: number): any;
  /** Copy validated settings into this mode's state fields / read them back. */
  protected abstract writeSettings(settings: RoomSettings): void;
  protected abstract readSettings(): RoomSettings;

  /** Client -> server messages. All of them are validated; nothing here trusts the payload. */
  messages = {
    /** { ready?: boolean } - toggles (or sets) this player's ready flag while the room is in the lobby. */
    ready: (client: Client, message: any) => this.onReadyMessage(client, message),
    /** Host only: { maxPlayers?, cityName?, cityLat?, cityLng?, spawnArea?, ...mode specific } */
    settings: (client: Client, message: any) => this.onSettingsMessage(client, message),
    /** { name: string } - change my display name (made unique within the room). */
    name: (client: Client, message: any) => this.onNameMessage(client, message),
  };

  onCreate(options: any) {
    // Creation options come from the client: validated and clamped (max 4 players). The game MODE is fixed by the room type, never by an option.
    const settings = mergeSettings(options, this.mode, DEFAULT_SETTINGS, 0);
    this.state.mode = this.mode;
    this.state.phase = "lobby";
    this.state.hostId = "";
    this.writeSettings(settings);
    this.maxClients = settings.maxPlayers;
    this.updateMetadata();
  }

  onJoin(client: Client, options: any) {
    // Defence in depth: the framework already enforces maxClients; this also counts seats held for players who are reconnecting.
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

  /** A player left for good: they asked to, or their reconnection window ran out. */
  onLeave(client: Client, code: CloseCode) {
    this.state.players.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) this.state.hostId = chooseNextHost(this.playerList());   // the next player becomes host
    this.updateMetadata();
    console.log(`[${this.mode}] ${client.sessionId} left (${code}), ${this.state.players.size} remain`);
  }

  /**
   * An unexpected disconnect (network blip, tab suspended): the player keeps their entity and seat for RECONNECT_SECONDS.
   * The framework then calls onReconnect() if they come back, or onLeave() if they do not.
   */
  onDrop(client: Client, code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => { /* room disposing or window expired: onLeave handles it */ });
    console.log(`[${this.mode}] ${client.sessionId} dropped (${code}), holding the seat for ${RECONNECT_SECONDS}s`);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    console.log(`[${this.mode}] ${client.sessionId} reconnected`);
  }

  onDispose() { console.log(`[${this.mode}] room ${this.roomId} disposing...`); }

  // ---------------------------------------------------------------- message handlers
  private onReadyMessage(client: Client, message: any) {
    if (this.state.phase !== "lobby") return;
    const player = this.state.players.get(client.sessionId); if (!player) return;
    player.ready = typeof message?.ready === "boolean" ? message.ready : !player.ready;
  }

 private onSettingsMessage(client: Client, message: any): void {
    if (client.sessionId !== this.state.hostId) return void client.send("error", { code: "not_host", message: "Only the host can change the room settings" });
    if (this.state.phase !== "lobby") return void client.send("error", { code: "not_lobby", message: "Settings can only change in the lobby" });
    const next = mergeSettings(message, this.mode, this.readSettings(), this.state.players.size);   // clamps to 2..4 and never below the players already inside
    this.writeSettings(next);
    this.maxClients = next.maxPlayers;
    this.updateMetadata();
  }

  private onNameMessage(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId); if (!player) return;
    const clean = sanitizeName(message?.name); if (!clean) return;
    player.name = uniqueName(clean, this.playerList().filter((p) => p.sessionId !== client.sessionId).map((p) => p.name));
    this.updateMetadata();
  }

  // ---------------------------------------------------------------- helpers
  protected playerList(): any[] { const out: any[] = []; this.state.players.forEach((p: any) => out.push(p)); return out; }

  /** The listing data the lobby room shows for this room (mode, seats, city, host). */
  protected updateMetadata() {
    const host = this.state.players.get(this.state.hostId);
    this.setMetadata({
      mode: this.mode, maxPlayers: this.state.maxPlayers, players: this.state.players.size,
      cityName: this.state.cityName, spawnArea: this.state.spawnArea, hostName: host ? host.name : "", phase: this.state.phase,
    });
  }
}
