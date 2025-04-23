const playerService = require('./playerService');
const { createGameBoard } = require('../utils/boardUtils');

let gameStates = {};

function createGame(ws, player) {
  const existingGame = Object.entries(gameStates).find(([_, game]) => 
    game.players.includes(player) && game.active
  );
  
  if (existingGame) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'You are already in a game'
    }));
    return;
  }

  const gameId = `${player}-${Date.now()}`;
  
  gameStates[gameId] = {
    players: [player],
    readyPlayers: [],
    boards: {
      [player]: createGameBoard()
    },
    ships: {
      [player]: []
    },
    turn: null,
    waitingForOpponent: true,
    active: true,
    created: Date.now()
  };

  ws.send(JSON.stringify({
    type: 'GAME_CREATED',
    gameId
  }));

  console.log(`Game ${gameId} created by ${player}, waiting for opponent`);
}

function invite(from, to) {
  const toSocket = playerService.getSocket(to);
  if (toSocket) {
    toSocket.send(JSON.stringify({ type: 'INVITE', from }));
  }
}

function acceptInvite(from, to) {
  const fromSocket = playerService.getSocket(from);
  const toSocket = playerService.getSocket(to);
  if (!fromSocket || !toSocket) return;

  // Use a more consistent game ID format
  const gameId = `${from}-${to}-${Date.now()}`;
  
  gameStates[gameId] = {
    players: [from, to],
    readyPlayers: [],
    boards: {
      [from]: createGameBoard(),
      [to]: createGameBoard()
    },
    ships: {
      [from]: [],
      [to]: []
    },
    turn: null,
    active: true,
    created: Date.now()
  };

  [fromSocket, toSocket].forEach((socket, i) => {
    socket.send(JSON.stringify({
      type: 'START_GAME',
      opponent: gameStates[gameId].players[1 - i],
      gameId
    }));
  });

  console.log(`Game ${gameId} started between ${from} and ${to}`);
}

function findGame(gameId) {
  // Direct lookup first
  let game = gameStates[gameId];
  
  if (!game) {
    // Find games that include a player in the gameId
    const playerName = gameId.split('-')[0];
    if (playerName) {
      const playerGames = Object.entries(gameStates)
        .filter(([id, g]) => id.includes(playerName) && g.active)
        .sort((a, b) => b[1].created - a[1].created); // Sort by most recent
      
      if (playerGames.length > 0) {
        return { gameId: playerGames[0][0], game: playerGames[0][1] };
      }
    }
    
    // If still not found, check all active games
    const allGames = Object.entries(gameStates)
      .filter(([_, g]) => g.active)
      .sort((a, b) => b[1].created - a[1].created);
    
    if (allGames.length > 0) {
      return { gameId: allGames[0][0], game: allGames[0][1] };
    }
  } else {
    return { gameId, game };
  }
  
  return { gameId: null, game: null };
}

function joinGame(ws, gameId, player) {
  console.log(`Player ${player} trying to join game ${gameId}`);
  
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }
  
  // Update gameId to the found one
  gameId = foundGameId;
  
  if (game.players.includes(player)) {
    const opponent = game.players.find(p => p !== player);
    
    ws.send(JSON.stringify({ 
      type: 'RECONNECTED', 
      gameId,
      opponent,
      gamePhase: game.readyPlayers.length === 2 ? 'battle' : 'placement'
    }));
    console.log(`Player ${player} reconnected to game ${gameId} against ${opponent}`);
    return;
  }

  if (game.waitingForOpponent && game.players.length === 1) {
    const hostPlayer = game.players[0];
    
    if (hostPlayer === player) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Cannot join your own game' }));
      return;
    }
    
    game.players.push(player);
    game.boards[player] = createGameBoard();
    game.ships[player] = [];
    game.waitingForOpponent = false;
    
    const hostSocket = playerService.getSocket(hostPlayer);
    
    if (hostSocket) {
      hostSocket.send(JSON.stringify({
        type: 'GAME_JOINED',
        player
      }));
    }
    
    ws.send(JSON.stringify({
      type: 'START_GAME',
      opponent: hostPlayer,
      gameId
    }));
    
    console.log(`Player ${player} joined game ${gameId}, starting game`);
    return;
  }

  ws.send(JSON.stringify({ type: 'ERROR', message: 'Game is full' }));
}

function leaveGame(gameId, player) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game) return;
  gameId = foundGameId;

  const opponent = game.players.find(p => p !== player);
  const opponentSocket = playerService.getSocket(opponent);
  if (opponentSocket) {
    opponentSocket.send(JSON.stringify({ type: 'GAME_LEFT', player }));
  }
  
  if (game.readyPlayers.length < 2) {
    delete gameStates[gameId];
    console.log(`Game ${gameId} deleted because ${player} left during placement phase`);
  }
}

function placeShips(gameId, player, ships) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game) return;
  gameId = foundGameId;

  game.ships[player] = ships;
  
  if (!game.readyPlayers.includes(player)) {
    game.readyPlayers.push(player);
  }

  const opponent = game.players.find(p => p !== player);
  playerService.getSocket(opponent)?.send(JSON.stringify({
    type: 'SHIPS_PLACED',
    player
  }));

  if (game.readyPlayers.length === 2) {
    const first = Math.random() < 0.5 ? game.players[0] : game.players[1];
    game.turn = first;
    
    game.players.forEach(p => {
      const playerSocket = playerService.getSocket(p);
      if (playerSocket) {
        playerSocket.send(JSON.stringify({
          type: 'GAME_READY',
          firstPlayer: first
        }));
      }
    });
    
    console.log(`Game ${gameId} is ready, ${first} goes first`);
  }
}

function attack({ gameId, attacker, defender, position }) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game || !game.active) {
    playerService.getSocket(attacker)?.send(JSON.stringify({
      type: 'ERROR',
      message: 'Game not found or inactive'
    }));
    return;
  }
  
  gameId = foundGameId;
  
  if (game.turn !== attacker) {
    playerService.getSocket(attacker)?.send(JSON.stringify({
      type: 'ERROR',
      message: 'Not your turn'
    }));
    return;
  }

  const defenderSocket = playerService.getSocket(defender);
  if (defenderSocket) {
    defenderSocket.send(JSON.stringify({
      type: 'ATTACK',
      attacker,
      position
    }));
  } else {
    playerService.getSocket(attacker)?.send(JSON.stringify({
      type: 'ATTACK_RESULT',
      attacker,
      defender,
      position,
      hit: false,
      shipDestroyed: null
    }));
    game.turn = defender;
  }
}

function attackResult({ gameId, attacker, defender, position, hit, shipDestroyed }) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game || !game.active) return;
  gameId = foundGameId;

  if (!game.boards[defender]) game.boards[defender] = createGameBoard();
  game.boards[defender][position.row][position.col] = hit ? 'hit' : 'miss';
  
  if (!hit) game.turn = defender;

  const attackerSocket = playerService.getSocket(attacker);
  if (attackerSocket) {
    attackerSocket.send(JSON.stringify({
      type: 'ATTACK_RESULT',
      attacker,
      defender,
      position,
      hit,
      shipDestroyed
    }));
  }

  if (shipDestroyed) {
    if (!game.ships[defender]) game.ships[defender] = [];
    game.ships[defender] = game.ships[defender].filter(s => s.id !== shipDestroyed);
    
    if (game.ships[defender].length === 0) {
      endGame(gameId, attacker);
    }
  }
}

function chat({ gameId, from, message }) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game || !game.active) return;
  
  const to = game.players.find(p => p !== from);
  playerService.getSocket(to)?.send(JSON.stringify({ type: 'CHAT', from, message }));
}

function endGame(gameId, winner) {
  const { gameId: foundGameId, game } = findGame(gameId);
  
  if (!game || !game.active) return;
  gameId = foundGameId;

  game.active = false;
  game.winner = winner;

  game.players.forEach(player => {
    const playerSocket = playerService.getSocket(player);
    if (playerSocket) {
      playerSocket.send(JSON.stringify({
        type: 'GAME_OVER',
        winner
      }));
    }
  });

  setTimeout(() => {
    delete gameStates[gameId];
    console.log(`Game ${gameId} state cleared from memory`);
  }, 3600000);
}

function cleanupOldGames() {
  const now = Date.now();
  const oldGames = Object.entries(gameStates)
    .filter(([_, game]) => !game.active && now - game.created > 3600000);
    
  oldGames.forEach(([gameId, _]) => {
    delete gameStates[gameId];
    console.log(`Old game ${gameId} cleared from memory`);
  });
}

setInterval(cleanupOldGames, 3600000);

module.exports = {
  createGame,
  invite,
  acceptInvite,
  joinGame,
  leaveGame,
  placeShips,
  attack,
  attackResult,
  chat,
  endGame
};