# Football Auction & League Simulator

A runnable, browser-based multiplayer football auction and simulated league. Built with Node.js, Express, Socket.IO, and vanilla JavaScript to keep setup simple.

## Features
- Create/join rooms using a room code (up to 10 managers).
- Select unique clubs from several European leagues.
- €1,000M auction budget per manager.
- Real-player auction pool, timed bidding, bid validation, unsold players, auction log, and live room synchronization.
- Squad reveal and budget summaries.
- Saved round-robin season schedule (double round-robin by default).
- Starting XI, formation, and tactical controls.
- Server-side match simulation with goals, scorers, stats, and tactical/lineup effects.
- Matchday results, points table, top scorers, and season champion.
- Responsive dark football dashboard.
- Automated tests for fixtures, standings, and auction validation.

## Requirements
- Node.js 20 or newer
- Internet connection for the first `npm install` (dependencies are downloaded from npm). The game itself can then run locally.
- To play with friends over the internet, deploy the app to a Node-compatible host that supports WebSockets. Localhost is only available on your own device.

## Run locally
1. Extract this ZIP.
2. Open a terminal in the extracted folder.
3. Run:
   ```bash
   npm install
   npm test
   npm start
   ```
4. Open http://localhost:3000

## Play with friends
- On one device, create a room and select a club.
- Share the room code with other players.
- Each participant opens the deployed app, enters the room code, and selects a different club.
- The host starts the auction after the room is ready.
- For LAN play, find the host computer's local IP and open `http://HOST-LAN-IP:3000` on other devices on the same Wi-Fi. Ensure the firewall allows port 3000.
- For remote play, deploy to a host with persistent process support and WebSocket support. This starter uses in-memory room state, so restarting the server clears active rooms. Do not use serverless hosting unless adapted for persistent shared state.

## Game flow
Create/join room → choose club → auction → squad reveal → review season schedule → host starts league → set XI/formation/tactics → simulate matchdays → final table and champion.

## Important data notes
The bundled `data/players.json` is a curated starter pool of real footballers with positions, broad ratings, attributes, and illustrative auction prices. Ratings and auction prices are game-balancing values, not official ratings or market valuations. Player clubs/league labels represent the dataset's reference season and may change. The app does not scrape live data. Verify and refresh data before public release. Player names and factual sports data are included for gameplay; club logos/photos are not bundled, avoiding trademark/image licensing issues.

## State and security notes
- The server is authoritative for bidding, budgets, player ownership, fixture results, and standings.
- Active rooms are held in memory; a server restart clears them.
- This is a practical playable starter, not a hardened commercial service. It does not implement account registration, persistent database storage, global anti-cheat, or a distributed multi-instance deployment. Deploy a single persistent server for a private game.
- Anyone with a room code can attempt to join until the room fills. Share codes privately.
