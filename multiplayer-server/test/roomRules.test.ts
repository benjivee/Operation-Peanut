import assert from "assert";
import {
  MAX_PLAYERS_PER_ROOM, DEFAULT_SETTINGS, mergeSettings, sanitizeName, uniqueName, lowestFreeSlot, chooseNextHost,
} from "../src/shared/roomRules.js";

describe("room rules (no server needed)", () => {
  it("never allows more than 4 players, whatever the client asks for", () => {
    for (const v of [5, 99, 1e9, Infinity, -3, 0, 1, 2.7, "4", null, NaN, {}, []]) {
      const s = mergeSettings({ maxPlayers: v }, "coop");
      assert.ok(s.maxPlayers >= 2 && s.maxPlayers <= MAX_PLAYERS_PER_ROOM, `maxPlayers ${String(v)} -> ${s.maxPlayers}`);
    }
    assert.strictEqual(mergeSettings({ maxPlayers: 99 }, "coop").maxPlayers, 4);
    assert.strictEqual(mergeSettings({ maxPlayers: 3 }, "competitive").maxPlayers, 3);
    assert.strictEqual(mergeSettings({ maxPlayers: "4" }, "coop", { ...DEFAULT_SETTINGS, maxPlayers: 2 }).maxPlayers, 2, "a wrong type changes nothing");
  });

  it("never drops the limit below the players already inside", () => {
    assert.strictEqual(mergeSettings({ maxPlayers: 2 }, "coop", DEFAULT_SETTINGS, 3).maxPlayers, 3);
  });

  it("ignores everything that is not an object", () => {
    for (const bad of [null, undefined, "x", 5, [], () => 1]) assert.deepStrictEqual(mergeSettings(bad, "coop"), DEFAULT_SETTINGS);
  });

  it("cleans city and spawn area text", () => {
    const s = mergeSettings({ cityName: "  <b>Toronto</b>\n   Canada  ", spawnArea: "Down Town!!<script>", cityLat: 43.65, cityLng: -79.38 }, "coop");
    assert.strictEqual(s.cityName, "bTorontob Canada", "only letters, digits, spaces and . , ' - survive; whitespace is collapsed");
    assert.ok(!/[<>/]/.test(s.cityName));
    assert.strictEqual(s.spawnArea, "downtownscript");
    assert.strictEqual(mergeSettings({ cityName: "x".repeat(500) }, "coop").cityName.length, 80);
    assert.strictEqual(mergeSettings({ spawnArea: "a".repeat(100) }, "coop").spawnArea.length, 24);
  });

  it("only accepts a real latitude / longitude pair", () => {
    assert.deepStrictEqual([mergeSettings({ cityLat: 999, cityLng: 10 }, "coop").cityLat, mergeSettings({ cityLat: 999, cityLng: 10 }, "coop").cityLng], [0, 0]);
    assert.strictEqual(mergeSettings({ cityLat: 43.65 }, "coop").cityLat, 0, "one value alone is ignored");
    assert.strictEqual(mergeSettings({ cityLat: 43.65, cityLng: -79.38 }, "coop").cityLng, -79.38);
  });

  it("mode specific settings only apply to their own mode", () => {
    assert.strictEqual(mergeSettings({ reviveSeconds: 10 }, "coop").reviveSeconds, 10);
    assert.strictEqual(mergeSettings({ reviveSeconds: 99 }, "coop").reviveSeconds, 15);
    assert.strictEqual(mergeSettings({ reviveSeconds: 10 }, "competitive").reviveSeconds, DEFAULT_SETTINGS.reviveSeconds);
    assert.strictEqual(mergeSettings({ matchMinutes: 15 }, "competitive").matchMinutes, 15);
    assert.strictEqual(mergeSettings({ matchMinutes: 7 }, "competitive").matchMinutes, 10, "not one of 5 / 10 / 15 / 20");
    assert.strictEqual(mergeSettings({ friendlyFire: false }, "competitive").friendlyFire, false);
    assert.strictEqual(mergeSettings({ friendlyFire: false }, "coop").friendlyFire, true, "friendly fire is a competitive-only setting");
  });

  it("a client cannot switch the game mode through options", () => {
    const s: any = mergeSettings({ mode: "competitive", maxPlayers: 4 }, "coop");
    assert.strictEqual(s.mode, undefined);
  });

  it("sanitizes player names", () => {
    assert.strictEqual(sanitizeName("  Alice  "), "Alice");
    assert.strictEqual(sanitizeName("<script>alert(1)</script>"), "scriptalert1sc", "symbols stripped, then cut to 14 characters");
    assert.strictEqual(sanitizeName("a".repeat(50)).length, 14);
    assert.strictEqual(sanitizeName(123), "");
    assert.strictEqual(sanitizeName(null), "");
    assert.strictEqual(sanitizeName("Zoë  Ö"), "Zoë Ö");
  });

  it("makes names unique inside a room", () => {
    assert.strictEqual(uniqueName("Sam", []), "Sam");
    assert.strictEqual(uniqueName("Sam", ["Sam"]), "Sam 2");
    assert.strictEqual(uniqueName("sam", ["SAM", "sam 2"]), "sam 3");
    assert.ok(uniqueName("a".repeat(14), ["a".repeat(14)]).length <= 14);
  });

  it("hands out the lowest free seat", () => {
    assert.strictEqual(lowestFreeSlot([]), 0);
    assert.strictEqual(lowestFreeSlot([0, 1, 3]), 2);
    assert.strictEqual(lowestFreeSlot([0, 1, 2, 3]), -1, "full room");
  });

  it("picks the next host: lowest seat that is still connected", () => {
    assert.strictEqual(chooseNextHost([]), "");
    assert.strictEqual(chooseNextHost([{ sessionId: "b", slot: 2, connected: true }, { sessionId: "a", slot: 1, connected: false }, { sessionId: "c", slot: 3, connected: true }]), "b");
    assert.strictEqual(chooseNextHost([{ sessionId: "a", slot: 1, connected: false }, { sessionId: "z", slot: 0, connected: false }]), "z", "nobody connected: still deterministic");
  });
});
