const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  makeSchedule,
  standings,
  canBid,
  simulateMatch,
  FORMATIONS
} = require('./lib/game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);

const players = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'data', 'players.json'),
    'utf8'
  )
);

const clubs = [
  ['Arsenal', 'Premier League'],
  ['Liverpool', 'Premier League'],
  ['Manchester City', 'Premier League'],
  ['Chelsea', 'Premier League'],
  ['Manchester United', 'Premier League'],
  ['Tottenham Hotspur', 'Premier League'],
  ['Real Madrid', 'La Liga'],
  ['Barcelona', 'La Liga'],
  ['AtlÃ©tico Madrid', 'La Liga'],
  ['Athletic Club', 'La Liga'],
  ['Bayern Munich', 'Bundesliga'],
  ['Borussia Dortmund', 'Bundesliga'],
  ['Bayer Leverkusen', 'Bundesliga'],
  ['Inter', 'Serie A'],
  ['AC Milan', 'Serie A'],
  ['Juventus', 'Serie A'],
  ['Napoli', 'Serie A'],
  ['Paris Saint-Germain', 'Ligue 1'],
  ['Marseille', 'Ligue 1'],
  ['Monaco', 'Ligue 1']
].map(([name, league]) => ({ name, league }));

const rooms = new Map();
const socketSessions = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: players.length
  });
});

app.get('/api/clubs', (_req, res) => {
  res.json(clubs);
});

function makeRoomCode() {
  let code;

  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (rooms.has(code));

  return code;
}

function sendError(socket, message) {
  socket.emit('notice', {
    type: 'error',
    message
  });
}

function sessionFor(socket) {
  const session = socketSessions.get(socket.id);

  if (!session) return null;

  const room = rooms.get(session.roomCode);

  if (!room) return null;

  const team = room.teams[session.teamId];

  if (!team) return null;

  return { room, team, session };
}

function publicTeam(team) {
  return {
    id: team.id,
    manager: team.manager,
    club: team.club,
    league: team.league,
    budget: team.budget,

    squad: team.squad.map(player => ({ ...player })),

    lineup: [...(team.lineup || [])],
    formation: team.formation,
    tactics: { ...team.tactics },

    isHost: team.isHost,
    connected: Boolean(team.socketId)
  };
}

/*
 * IMPORTANT FIX:
 * The auction history belongs to room.auction.log,
 * not room.log.
 *
 * This prevents the original TypeError when the
 * first auction player is broadcast to the clients.
 */
function safeRoom(room) {
  let auction = null;

  if (room.auction) {
    auction = {
      index: room.auction.index,
      total: room.auction.order.length,

      currentPlayer: room.currentPlayer
        ? { ...room.currentPlayer }
        : null,

      highestBid: room.highestBid,
      highestBidder: room.highestBidder,
      endsAt: room.endsAt,

      log: (room.auction.log || []).slice(-12)
    };
  }

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,

    teams: Object.values(room.teams).map(publicTeam),

    clubList: clubs,
    auction,

    schedule: room.schedule,
    matchday: room.matchday,

    standings: standings(room.teams, room.schedule),

    lastResults: room.lastResults,
    champion: room.champion,

    playerCount: players.length,
    formations: FORMATIONS
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('state', safeRoom(room));
}

function getHostRoom(socket) {
  const current = sessionFor(socket);

  if (!current) {
    sendError(socket, 'Your room session was not found. Rejoin the room.');
    return null;
  }

  if (current.room.hostId !== socket.id) {
    sendError(socket, 'Only the host can perform this action.');
    return null;
  }

  return current.room;
}

function joinTeam(socket, room, name, club, isHost) {
  const cleanName = String(name || '').trim().slice(0, 24);

  if (!cleanName) {
    return sendError(socket, 'Enter a manager name.');
  }

  if (
    Object.values(room.teams).some(
      team => team.manager.toLowerCase() === cleanName.toLowerCase()
    )
  ) {
    return sendError(socket, 'That manager name is already used in this room.');
  }

  const selectedClub = clubs.find(item => item.name === club);

  if (!selectedClub) {
    return sendError(socket, 'Select a valid club.');
  }

  if (Object.values(room.teams).some(team => team.club === club)) {
    return sendError(socket, 'That club is already selected.');
  }

  const id = crypto.randomBytes(8).toString('hex');

  const team = {
    id,
    manager: cleanName,
    club,
    league: selectedClub.league,

    budget: 1000,
    squad: [],

    socketId: socket.id,
    isHost,

    lineup: [],
    formation: '4-3-3',

    tactics: {
      mentality: 'Balanced',
      pressing: 'Medium',
      build: 'Balanced'
    }
  };

  room.teams[id] = team;

  socketSessions.set(socket.id, {
    roomCode: room.code,
    teamId: id
  });

  socket.join(room.code);

  socket.emit('joined', {
    teamId: id,
    code: room.code,
    isHost
  });

  broadcastRoom(room);
}

/*
 * Finalize the current auction player exactly once.
 */
function settleCurrentPlayer(room) {
  if (!room.currentPlayer || !room.auction) return;

  const player = room.currentPlayer;

  if (room.highestBidder) {
    const winningTeam = room.teams[room.highestBidder];

    if (winningTeam) {
      winningTeam.budget -= room.highestBid;

      winningTeam.squad.push({
        ...player,
        paid: room.highestBid
      });

      room.auction.log.push({
        player: player.name,
        bid: room.highestBid,
        manager: winningTeam.manager,
        club: winningTeam.club
      });
    } else {
      room.auction.log.push({
        player: player.name,
        bid: 0,
        manager: 'Unsold',
        club: 'â€”'
      });
    }
  } else {
    room.auction.log.push({
      player: player.name,
      bid: 0,
      manager: 'Unsold',
      club: 'â€”'
    });
  }

  room.currentPlayer = null;
  room.highestBid = 0;
  room.highestBidder = null;
  room.endsAt = null;
}

/*
 * Move to the next player or finish the auction.
 */
function advanceAuction(room) {
  if (room.phase !== 'auction' || !room.auction) return;

  while (room.auction.index < room.auction.order.length) {
    const player = room.auction.order[room.auction.index++];

    const alreadyOwned = Object.values(room.teams).some(team =>
      team.squad.some(owned => owned.id === player.id)
    );

    if (alreadyOwned) continue;

    const baseBid = player.rating >= 90 ? 30 : player.rating >= 85 ? 20 : 15;
    room.currentPlayer = { ...player, baseBid };
    room.highestBid = 0;
    room.highestBidder = null;
    room.endsAt = Date.now() + 6000;

    broadcastRoom(room);
    return;
  }

  room.phase = 'reveal';
  room.currentPlayer = null;
  room.endsAt = null;

  broadcastRoom(room);
}

function finishAuction(room) {
  if (room.phase !== 'auction') return;

  settleCurrentPlayer(room);

  room.phase = 'reveal';
  room.endsAt = null;

  broadcastRoom(room);
}

/*
 * Auction timer.
 */
setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (
      room.phase === 'auction' &&
      room.currentPlayer &&
      room.endsAt &&
      now >= room.endsAt
    ) {
      settleCurrentPlayer(room);

      broadcastRoom(room);

      setTimeout(() => {
        advanceAuction(room);
      }, 800);
    }
  }
}, 200);

/*
 * Socket.IO multiplayer events.
 */
io.on('connection', socket => {

  socket.on('createRoom', payload => {
    const { name, club } = payload || {};

    if (
      !String(name || '').trim() ||
      !clubs.some(item => item.name === club)
    ) {
      return sendError(
        socket,
        'Enter a manager name and select a club.'
      );
    }

    const code = makeRoomCode();

    const room = {
      code,
      hostId: socket.id,
      phase: 'lobby',

      teams: {},

      auction: null,
      currentPlayer: null,
      highestBid: 0,
      highestBidder: null,
      endsAt: null,

      schedule: [],
      matchday: 1,

      lastResults: [],
      champion: null
    };

    rooms.set(code, room);

    joinTeam(socket, room, name, club, true);
  });

  socket.on('joinRoom', payload => {
    const { name, club } = payload || {};

    const code = String(payload?.code || '')
      .trim()
      .toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      return sendError(socket, 'Room not found. Check the code.');
    }

    if (room.phase !== 'lobby') {
      return sendError(socket, 'This room has already started.');
    }

    if (Object.keys(room.teams).length >= 10) {
      return sendError(socket, 'Room is full (maximum 10 managers).');
    }

    joinTeam(socket, room, name, club, false);
  });

  /*
   * Start auction.
   */
  socket.on('startAuction', () => {
    const room = getHostRoom(socket);

    if (!room) return;

    if (room.phase !== 'lobby') {
      return sendError(socket, 'The auction has already started.');
    }

    if (Object.keys(room.teams).length < 2) {
      return sendError(
        socket,
        'At least two managers must join before the auction.'
      );
    }

    room.phase = 'auction';

    const count = Math.min(
      players.length,
      Math.max(40, Object.keys(room.teams).length * 15)
    );

    const order = [...players]
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    room.auction = {
      index: 0,
      order,
      log: []
    };

    advanceAuction(room);
  });

  /*
   * Place a bid.
   */
  socket.on('bid', payload => {
    const current = sessionFor(socket);

    if (!current) {
      return sendError(
        socket,
        'Your room session was not found. Rejoin the room.'
      );
    }

    const { room, team } = current;
    const amount = Number(payload?.amount);

    const validation = canBid(room, team.id, amount);

    if (!validation.ok) {
      return sendError(socket, validation.reason);
    }

    room.highestBid = amount;
    room.highestBidder = team.id;

    room.endsAt = Date.now() + 6000;

    broadcastRoom(room);
  });

  /*
   * End the auction early.
   */
  socket.on('finishAuction', () => {
    const room = getHostRoom(socket);

    if (!room) return;

    if (room.phase !== 'auction') {
      return sendError(socket, 'The auction is not active.');
    }

    finishAuction(room);
  });

  /*
   * Save lineup and tactics.
   */
  socket.on('saveLineup', payload => {
    const current = sessionFor(socket);

    if (!current) {
      return sendError(socket, 'Your room session was not found.');
    }

    const { room, team } = current;

    const {
      formation,
      lineup,
      mentality,
      pressing,
      build
    } = payload || {};

    if (!['league', 'complete'].includes(room.phase)) {
      return sendError(socket, 'Lineups unlock after the league starts.');
    }

    if (!FORMATIONS[formation]) {
      return sendError(socket, 'Invalid formation.');
    }

    const ids = Array.isArray(lineup) ? lineup.slice(0, 11) : [];

    if (
      new Set(ids).size !== ids.length ||
      ids.some(id => !team.squad.some(player => player.id === id))
    ) {
      return sendError(
        socket,
        'Lineup contains duplicate or unowned players.'
      );
    }

    if (ids.length !== 11) {
      return sendError(socket, 'Select exactly 11 players before saving.');
    }

    if (
      !ids.some(
        id => team.squad.find(player => player.id === id)?.pos === 'GK'
      )
    ) {
      return sendError(
        socket,
        'Your starting XI must include a goalkeeper.'
      );
    }

    team.formation = formation;
    team.lineup = ids;

    team.tactics = {
      mentality: [
        'Very Defensive',
        'Defensive',
        'Balanced',
        'Attacking',
        'Very Attacking'
      ].includes(mentality)
        ? mentality
        : 'Balanced',

      pressing: ['Low', 'Medium', 'High'].includes(pressing)
        ? pressing
        : 'Medium',

      build: ['Short Passing', 'Balanced', 'Direct'].includes(build)
        ? build
        : 'Balanced'
    };

    broadcastRoom(room);

    socket.emit('notice', {
      type: 'success',
      message: 'Lineup and tactics saved.'
    });
  });

  /*
   * Start the league and generate the fixture list.
   */
  socket.on('startLeague', () => {
    const room = getHostRoom(socket);

    if (!room) return;

    if (room.phase !== 'reveal') {
      return sendError(socket, 'Finish the auction first.');
    }

    if (Object.keys(room.teams).length < 2) {
      return sendError(socket, 'At least two managers are required.');
    }

    room.schedule = makeSchedule(
      Object.keys(room.teams),
      true
    );

    room.matchday = 1;
    room.phase = 'league';
    room.lastResults = [];

    broadcastRoom(room);
  });

  /*
   * Simulate the current matchday.
   */
  socket.on('simulateMatchday', () => {
    const room = getHostRoom(socket);

    if (!room) return;

    if (room.phase !== 'league') {
      return sendError(socket, 'The league is not active.');
    }

    const fixtures = room.schedule.filter(
      fixture =>
        fixture.round === room.matchday &&
        fixture.status === 'scheduled'
    );

    if (!fixtures.length) {
      return sendError(
        socket,
        'No fixtures remain in this matchday.'
      );
    }

    const results = [];

    for (const fixture of fixtures) {
      const home = room.teams[fixture.home];
      const away = room.teams[fixture.away];

      if (!home || !away) continue;

      const result = simulateMatch(home, away, fixture);

      fixture.status = 'played';
      fixture.result = result;

      results.push({
        fixture,
        home: home.club,
        away: away.club,
        result
      });
    }

    room.lastResults = results;

    const remaining = room.schedule.filter(
      fixture => fixture.status === 'scheduled'
    );

    if (remaining.length === 0) {
      room.phase = 'complete';

      room.champion =
        standings(room.teams, room.schedule)[0]?.name || null;
    } else {
      room.matchday = Math.min(
        ...remaining.map(fixture => fixture.round)
      );
    }

    broadcastRoom(room);
  });

  /*
   * Handle disconnects.
   */
  socket.on('disconnect', () => {
    const session = socketSessions.get(socket.id);

    socketSessions.delete(socket.id);

    if (!session) return;

    const room = rooms.get(session.roomCode);

    if (!room) return;

    const team = room.teams[session.teamId];

    if (team) {
      team.socketId = null;
    }

    if (room.hostId === socket.id) {
      const replacement = Object.values(room.teams).find(
        candidate => candidate.socketId
      );

      if (replacement) {
        room.hostId = replacement.socketId;
      }
    }

    broadcastRoom(room);
  });
});

/*
 * Start the server.
 */
server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Football Auction Simulator running at http://localhost:${PORT}`
  );

  console.log(
    `Loaded ${players.length} player records and ${clubs.length} selectable clubs.`
  );
});
