# Multiplayer rooms (Stage 1)

Two new room types sit next to the existing `my_room` (kept untouched as the working reference) and the built-in `lobby`:

| Room name | Class | Mode |
|---|---|---|
| `coop_room` | `src/rooms/CoopRoom.ts` | Co-op Survival, 4 players max |
| `competitive_room` | `src/rooms/CompetitiveRoom.ts` | Competitive Survival, 4 players max |

Both extend `src/rooms/BaseGameRoom.ts` (cap, seats, host, ready, settings, leave, drop / reconnect). Their state classes are in `src/rooms/schema/GameRoomState.ts`; what a client may ask for is decided in `src/shared/roomRules.ts`.

## What a room holds
* **Per player:** `sessionId`, `name`, `slot` (seat 0-3), `x`, `y`, `health`, `maxHealth`, `alive`, `ready`, `connected` (false while a dropped player's seat is held). Competitive players also have `score`, `kills`, `deaths` (nothing updates them yet).
* **Per room:** `mode`, `phase` ("lobby"), `hostId`, `maxPlayers` (2-4), `cityName`, `cityLat`, `cityLng`, `spawnArea`, plus `reviveSeconds` (co-op) or `matchMinutes` + `friendlyFire` (competitive).
* **Listing metadata** (shown by the `lobby` room): `mode`, `maxPlayers`, `players`, `cityName`, `spawnArea`, `hostName`, `phase`.

## Rules the server enforces
* Hard cap of 4 clients (`maxClients`); the host may lower it to 2-4 but never raise it, and never below the players already inside. A seat held for a dropped player still counts, so nobody can take it.
* The game mode is fixed by the room type; a `mode` option from a client is ignored.
* Creation options and all messages are validated / clamped (text is cleaned and length-limited, numbers range-checked, unknown fields ignored).
* Only the host can change settings, and only in the lobby. When the host leaves for good, the lowest connected seat becomes host.
* Unexpected disconnect: the player keeps their entity and seat for 30 s (`connected=false`); `onReconnect` restores it, otherwise `onLeave` frees the seat.

Messages (client -> server): `ready` `{ ready?: boolean }`, `settings` `{ maxPlayers?, cityName?, cityLat?, cityLng?, spawnArea?, reviveSeconds? | matchMinutes?, friendlyFire? }` (host only), `name` `{ name }`. Errors come back as an `error` message `{ code, message }`.

Not built yet (later stages): starting a match, the real shared map, zombies, weapons, combat, revives, scoring.

## Test it locally
```bash
cd multiplayer-server
npm install
npm run build          # TypeScript compile (fix any error before going on)
npm test               # unit tests for the rules + real-server tests for both rooms + the existing my_room test
npm start              # server on http://localhost:2567
```
Manual check with the playground (http://localhost:2567):
1. Pick `coop_room`, **Join/Create**; open a second browser tab, pick `coop_room`, and join the *same room* (use "Join by id" / the room list). Both players should appear in the state with seats 0 and 1, and the first is `hostId`.
2. Join with two more tabs (4 players). A fifth must be refused.
3. Repeat with `competitive_room`.
4. Reconnection: with a player joined, open DevTools > Network, set **Offline** for ~5 s, then back **Online**. The player's `connected` should go false then true, with the same `sessionId` and seat. Staying offline over 30 s removes the player.
5. Open http://localhost:2567/monitor to watch rooms and their metadata.
