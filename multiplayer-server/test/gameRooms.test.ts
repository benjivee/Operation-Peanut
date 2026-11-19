import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";

/** Poll until `cond` is true (state changes from other clients arrive a moment after the call). */
async function waitFor(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting for condition"); await new Promise((r) => setTimeout(r, 20)); }
}

describe("multiplayer rooms (boots the real server and connects real clients)", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());
  beforeEach(async () => { await colyseus.cleanup(); });

for (const [roomName, mode] of [["coop_room", "coop"], ["competitive_room", "competitive"]] as const) {
  describe(`${roomName}`, () => {

    it("is registered and starts in the lobby with its game mode", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      assert.strictEqual(room.state.mode, mode);
      assert.strictEqual(room.state.phase, "lobby");
      assert.strictEqual(room.state.maxPlayers, 4);
      assert.strictEqual(room.maxClients, 4);
      if (room.metadata) assert.strictEqual(room.metadata.mode, mode, "room metadata identifies the mode");
    });

    it("lets two clients join, with their own player data, seats and a host", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      const a = await colyseus.connectTo(room, { name: "Alice" });
      const b = await colyseus.connectTo(room, { name: "Bob" });
      await waitFor(() => room.state.players.size === 2);
      const pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId);
      assert.strictEqual(pa.name, "Alice"); assert.strictEqual(pb.name, "Bob");
      assert.strictEqual(pa.sessionId, a.sessionId);
      assert.deepStrictEqual([pa.slot, pb.slot], [0, 1]);
      assert.strictEqual(pa.health, 100); assert.strictEqual(pa.alive, true); assert.strictEqual(pa.ready, false); assert.strictEqual(pa.connected, true);
      assert.strictEqual(typeof pa.x, "number"); assert.strictEqual(typeof pa.y, "number");
      assert.strictEqual(room.state.hostId, a.sessionId, "the first player to join is the host");
      if (mode === "competitive") assert.deepStrictEqual([pa.score, pa.kills, pa.deaths], [0, 0, 0]);
    });

    it("rejects a fifth player", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      for (const n of ["A", "B", "C", "D"]) await colyseus.connectTo(room, { name: n });
      await waitFor(() => room.state.players.size === 4);
      await assert.rejects(colyseus.connectTo(room, { name: "E" }), "the fifth client must be refused");
      assert.strictEqual(room.state.players.size, 4);
    });

    it("cannot be created with more than 4 players, and cannot change mode through options", async () => {
      const room: any = await colyseus.createRoom(roomName, { maxPlayers: 99, mode: mode === "coop" ? "competitive" : "coop", cityName: "<b>Paris</b>" });
      assert.strictEqual(room.state.maxPlayers, 4);
      assert.strictEqual(room.maxClients, 4);
      assert.strictEqual(room.state.mode, mode);
      assert.ok(!/[<>]/.test(room.state.cityName));
    });

    it("frees the seat when a player leaves, and passes the host role on", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      const a = await colyseus.connectTo(room, { name: "Alice" });
      const b = await colyseus.connectTo(room, { name: "Bob" });
      await waitFor(() => room.state.players.size === 2);
      await a.leave();
      await waitFor(() => room.state.players.size === 1);
      assert.strictEqual(room.state.hostId, b.sessionId, "Bob becomes host");
      const c = await colyseus.connectTo(room, { name: "Cara" });
      await waitFor(() => room.state.players.size === 2);
      assert.strictEqual(room.state.players.get(c.sessionId).slot, 0, "the freed seat is reused");
    });

    it("only the host can change settings, and settings are validated", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      const host = await colyseus.connectTo(room, { name: "Host" });
      const guest = await colyseus.connectTo(room, { name: "Guest" });
      await waitFor(() => room.state.players.size === 2);
      guest.send("settings", { maxPlayers: 2, cityName: "Hacked" });
      await room.waitForNextMessage();
      assert.strictEqual(room.state.maxPlayers, 4, "a non-host change is ignored");
      host.send("settings", { maxPlayers: 99, cityName: "Toronto", cityLat: 43.65, cityLng: -79.38, spawnArea: "Downtown" });
      await room.waitForNextMessage();
      assert.strictEqual(room.state.maxPlayers, 4);
      assert.strictEqual(room.state.cityName, "Toronto"); assert.strictEqual(room.state.spawnArea, "downtown");
      host.send("settings", { maxPlayers: 2 });
      await room.waitForNextMessage();
      assert.strictEqual(room.state.maxPlayers, 2); assert.strictEqual(room.maxClients, 2);
      await assert.rejects(colyseus.connectTo(room, { name: "Third" }), "the lowered limit is enforced");
    });

    it("toggles ready and makes names unique", async () => {
      const room: any = await colyseus.createRoom(roomName, {});
      const a = await colyseus.connectTo(room, { name: "Sam" });
      const b = await colyseus.connectTo(room, { name: "Sam" });
      await waitFor(() => room.state.players.size === 2);
      assert.notStrictEqual(room.state.players.get(a.sessionId).name, room.state.players.get(b.sessionId).name);
      a.send("ready", { ready: true });
      await room.waitForNextMessage();
      assert.strictEqual(room.state.players.get(a.sessionId).ready, true);
      a.send("ready", {});
      await room.waitForNextMessage();
      assert.strictEqual(room.state.players.get(a.sessionId).ready, false, "no value toggles");
    });
  });
}

describe("existing rooms still work", () => {
  it("my_room can still be created and joined", async () => {
    const room: any = await colyseus.createRoom("my_room", {});
    const c = await colyseus.connectTo(room);
    assert.ok(room.state.players.get(c.sessionId));
  });
});
});
