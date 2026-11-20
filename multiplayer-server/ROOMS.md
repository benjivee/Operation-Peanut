# Multiplayer rooms — Stages 1 and 2A

The co-op and competitive room types sit beside the original MyRoom and built-in lobby. The original room remains registered and unchanged.

| Room | Mode | Capacity |
|---|---|---:|
| coop_room | Co-op Survival | Up to 4 |
| competitive_room | Competitive Survival | Up to 4 |

## Lobby and match start

The host starts with the start message. The server checks that the requester is the current connected host, the room is in the lobby, at least two players are connected, every connected non-host player is ready, and a city name, valid latitude/longitude pair and safe spawn-area key have been selected.

A successful start changes phase to playing, locks the room against late joins, and broadcasts match_started with the selected world information. Lobby settings and ready changes are ignored after start.

## Player movement

Clients may send move with { x, y, angle? } while the match is playing. The server uses the sending connection's session ID to select the player; a client cannot name another player to move. Invalid values and out-of-bounds coordinates are rejected. Subsequent movement is rate-limited and clamped to 520 world pixels per second, with elapsed time capped at 0.5 seconds. Aim angle is normalized to radians.

Important limitation: this is an initial movement-validation layer, not full server authority. The server does not yet have MapTiler collision, wall, water, or spawn data. A player's first valid movement message seeds their initial position, so a malicious client could choose that first position. Server-assigned spawn positions and server-side collision/gameplay simulation are later work.

## Reconnection

Unexpected disconnects hold a player's seat for 30 seconds. Their entity remains in room state with connected=false; reconnecting restores it. Movement timestamps use a monotonic server clock.

## State

Player state includes sessionId, name, slot, x, y, angle, health, maxHealth, alive, ready, and connected. Competitive players also have score, kills, and deaths; these counters are not yet driven by gameplay.

Room state includes phase, hostId, mode, maxPlayers, cityName, cityLat, cityLng, and spawnArea, plus mode-specific settings.

## Run locally

    cd multiplayer-server
    npm install
    npm run build
    npm test
    npm start

The production frontend connection and full Operation Peanut gameplay integration are not part of Stage 2A.
