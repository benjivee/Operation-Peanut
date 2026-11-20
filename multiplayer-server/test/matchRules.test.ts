import assert from "assert";
import { PHASE_LOBBY, PHASE_PLAYING, isValidWorld, validateStart } from "../src/shared/matchRules.js";
const world = { cityName: "Toronto", cityLat: 43.65, cityLng: -79.38, spawnArea: "downtown" };
const players = [{ sessionId: "host", ready: false, connected: true }, { sessionId: "guest", ready: true, connected: true }];
describe("match start rules", () => {
 it("allows the connected host to start when another connected player is ready", () => assert.deepStrictEqual(validateStart({ requesterId:"host",hostId:"host",phase:PHASE_LOBBY,players,world }),{ok:true}));
 it("rejects a non-host", () => assert.strictEqual(validateStart({requesterId:"guest",hostId:"host",phase:PHASE_LOBBY,players,world}).code,"not_host"));
 it("rejects starting outside the lobby", () => assert.strictEqual(validateStart({requesterId:"host",hostId:"host",phase:PHASE_PLAYING,players,world}).code,"not_lobby"));
 it("requires a connected host", () => assert.strictEqual(validateStart({requesterId:"host",hostId:"host",phase:PHASE_LOBBY,players:players.map(p=>({...p,connected:false})),world}).code,"host_missing"));
 it("requires at least two connected players", () => assert.strictEqual(validateStart({requesterId:"host",hostId:"host",phase:PHASE_LOBBY,players:[players[0]],world}).code,"not_enough_players"));
 it("requires every connected non-host player to be ready", () => assert.strictEqual(validateStart({requesterId:"host",hostId:"host",phase:PHASE_LOBBY,players:[players[0],{...players[1],ready:false}],world}).code,"players_not_ready"));
 it("ignores disconnected players when checking readiness", () => assert.deepStrictEqual(validateStart({requesterId:"host",hostId:"host",phase:PHASE_LOBBY,players:[...players,{sessionId:"away",ready:false,connected:false}],world}),{ok:true}));
 it("validates city, coordinates and safe spawn key", () => { assert.strictEqual(isValidWorld({...world,cityName:""}),false); assert.strictEqual(isValidWorld({...world,cityLat:91}),false); assert.strictEqual(isValidWorld({...world,cityLng:-181}),false); assert.strictEqual(isValidWorld({...world,cityLat:0,cityLng:0}),false); assert.strictEqual(isValidWorld({...world,spawnArea:"../bad"}),false); assert.strictEqual(isValidWorld(world),true); });
});
