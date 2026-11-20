import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";

async function waitFor(condition: () => boolean, timeout = 4000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for server state");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("Stage 2A match and movement integration", () => {
  let server: ColyseusTestServer<typeof appConfig>;
  before(async () => { server = await boot(appConfig); });
  after(async () => { await server.shutdown(); });
  beforeEach(async () => { await server.cleanup(); });

  for (const roomType of ["coop_room", "competitive_room"] as const) {
    it(roomType + " starts only when the host, player readiness and world are valid", async () => {
      const room: any = await server.createRoom(roomType, {});
      const host = await server.connectTo(room, { name: "Host" });
      const guest = await server.connectTo(room, { name: "Guest" });
      await waitFor(() => room.state.players.size === 2);
      host.send("settings", { cityName: "Toronto", cityLat: 43.65, cityLng: -79.38, spawnArea: "downtown" });
      await waitFor(() => room.state.cityName === "Toronto");
      host.send("start", {});
      await waitFor(() => room.state.phase === "playing");
      assert.strictEqual(room.state.phase, "playing");
      assert.strictEqual(room.state.mode, roomType === "coop_room" ? "coop" : "competitive");
      // Once started, a new connection must not be admitted to this room.
      await assert.rejects(server.connectTo(room, { name: "Late" }));
      guest.send("ready", { ready: false }); // lobby-only controls are ignored after start
      assert.strictEqual(room.state.phase, "playing");
    });

    it(roomType + " accepts a player's own movement only after match start", async () => {
      const room: any = await server.createRoom(roomType, {});
      const host = await server.connectTo(room, { name: "Host" });
      const guest = await server.connectTo(room, { name: "Guest" });
      await waitFor(() => room.state.players.size === 2);
      host.send("settings", { cityName: "Toronto", cityLat: 43.65, cityLng: -79.38, spawnArea: "downtown" });
      await waitFor(() => room.state.cityName === "Toronto");
      host.send("start", {});
      await waitFor(() => room.state.phase === "playing");
      guest.send("move", { x: 120, y: 240, angle: 1.25 });
      await waitFor(() => room.state.players.get(guest.sessionId).x === 120);
      const guestState = room.state.players.get(guest.sessionId);
      assert.strictEqual(guestState.y, 240);
      assert.strictEqual(guestState.angle, 1.25);
      assert.strictEqual(room.state.players.get(host.sessionId).x, 0, "the sender cannot choose another player's session ID");
    });
  }

  it("rejects start when a connected non-host player is not ready", async () => {
    const room: any = await server.createRoom("coop_room", {});
    const host = await server.connectTo(room, { name: "Host" });
    await server.connectTo(room, { name: "Guest" });
    await waitFor(() => room.state.players.size === 2);
    host.send("settings", { cityName: "Toronto", cityLat: 43.65, cityLng: -79.38, spawnArea: "downtown" });
    await waitFor(() => room.state.cityName === "Toronto");
    host.send("start", {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(room.state.phase, "lobby");
  });
});
