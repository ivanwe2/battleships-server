const playerService = require('./playerService');
const { createGameBoard } = require('../utils/boardUtils');

let gameStates = {};
// Add a players-to-games index to quickly find games by player name
let playerGames = {};

function createGame(ws, player) {
  // Check if player is already in a game
  const existingGameId = playerGames[player];
  const existingGame = existingGameId ? gameStates[existingGameId] : null;
  
  if (existingGame && existingGame.active) {
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

  // Index the game by player
  playerGames[player] = gameId;

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

  // Use a consistent game ID format
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

  // Index the game by both players
  playerGames[from] = gameId;
  playerGames[to] = gameId;

  [fromSocket, toSocket].forEach((socket, i) => {
    socket.send(JSON.stringify({
      type: 'START_GAME',
      opponent: gameStates[gameId].players[1 - i],
      gameId
    }));
  });

  console.log(`Game ${gameId} started between ${from} and ${to}`);
}

function findGameByPlayer(player) {
  // First check the index
  const gameId = playerGames[player];
  if (gameId && gameStates[gameId] && gameStates[gameId].active) {
    return { gameId, game: gameStates[gameId] };
  }
  
  // Fallback: Look through all games
  for (const [id, game] of Object.entries(gameStates)) {
    if (game.active && game.players.includes(player)) {
      // Update the index while we're here
      playerGames[player] = id;
      return { gameId: id, game };
    }
  }
  
  return { gameId: null, game: null };
}

function findGame(gameId, player) {
  // If we have both gameId and player, try player first
  if (player) {
    const playerGame = findGameByPlayer(player);
    if (playerGame.game) {
      return playerGame;
    }
  }
  
  // Direct lookup by gameId
  if (gameId && gameStates[gameId] && gameStates[gameId].active) {
    return { gameId, game: gameStates[gameId] };
  }
  
  // If we have gameId but not the game, see if it's a player name
  if (gameId) {
    const playerName = gameId.split('-')[0];
    if (playerName) {
      return findGameByPlayer(playerName);
    }
  }
  
  // Last resort: most recent active game
  const allGames = Object.entries(gameStates)
    .filter(([_, g]) => g.active)
    .sort((a, b) => b[1].created - a[1].created);
  
  if (allGames.length > 0) {
    return { gameId: allGames[0][0], game: allGames[0][1] };
  }
  
  return { gameId: null, game: null };
}

function joinGame(ws, gameId, player) {
  console.log(`Player ${player} trying to join game ${gameId}`);
  
  // First check if player is in any game
  let gameInfo = findGameByPlayer(player);
  
  // If not found by player, try the gameId
  if (!gameInfo.game) {
    gameInfo = findGame(gameId, player);
  }
  
  // Get the game and gameId from our lookup
  const { gameId: foundGameId, game } = gameInfo;
  
  if (!game) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }
  
  // Update gameId to the found one
  gameId = foundGameId;
  
  if (game.players.includes(player)) {
    const opponent = game.players.find(p => p !== player);
    
    // Update the player's game index
    playerGames[player] = gameId;
    
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
    
    // Index the game by player
    playerGames[player] = gameId;
    
    const hostSocket = playerService.getSocket(hostPlayer);
    
    if (hostSocket) {
      hostSocket.send(JSON.stringify({
        type: 'GAME_JOINED',
        player,
        gameId
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
  const { gameId: foundGameId, game } = findGame(gameId, player);
  
  if (!game) return;
  gameId = foundGameId;

  const opponent = game.players.find(p => p !== player);
  const opponentSocket = playerService.getSocket(opponent);
  if (opponentSocket) {
    opponentSocket.send(JSON.stringify({ 
      type: 'GAME_LEFT', 
      player,
      gameId 
    }));
  }
  
  // Only fully delete if game is in placement phase
  if (game.readyPlayers.length < 2) {
    delete gameStates[gameId];
    // Clean up indices
    game.players.forEach(p => delete playerGames[p]);
    console.log(`Game ${gameId} deleted because ${player} left during placement phase`);
  } else {
    // Just mark inactive but keep for reconnection
    game.active = false;
    console.log(`Game ${gameId} marked inactive because ${player} left`);
  }
}

function placeShips(gameId, player, ships) {
  const { gameId: foundGameId, game } = findGame(gameId, player);
  
  if (!game) return;
  gameId = foundGameId;

  // Update the index
  playerGames[player] = gameId;

  game.ships[player] = ships;
  
  if (!game.readyPlayers.includes(player)) {
    game.readyPlayers.push(player);
  }

  const opponent = game.players.find(p => p !== player);
  playerService.getSocket(opponent)?.send(JSON.stringify({
    type: 'SHIPS_PLACED',
    player,
    gameId
  }));

  if (game.readyPlayers.length === 2) {
    const first = Math.random() < 0.5 ? game.players[0] : game.players[1];
    game.turn = first;
    
    game.players.forEach(p => {
      const playerSocket = playerService.getSocket(p);
      if (playerSocket) {
        playerSocket.send(JSON.stringify({
          type: 'GAME_READY',
          firstPlayer: first,
          gameId
        }));
      }
    });
    
    console.log(`Game ${gameId} is ready, ${first} goes first`);
  }
}

function attack({ gameId, attacker, defender, position }) {
  const { gameId: foundGameId, game } = findGame(gameId, attacker);
  
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
      position,
      gameId
    }));
  } else {
    playerService.getSocket(attacker)?.send(JSON.stringify({
      type: 'ATTACK_RESULT',
      attacker,
      defender,
      position,
      hit: false,
      shipDestroyed: null,
      gameId
    }));
    game.turn = defender;
  }
}

function attackResult({ gameId, attacker, defender, position, hit, shipDestroyed }) {
  const { gameId: foundGameId, game } = findGame(gameId, attacker);
  
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
      shipDestroyed,
      gameId
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
  const { gameId: foundGameId, game } = findGame(gameId, from);
  
  if (!game || !game.active) return;
  
  const to = game.players.find(p => p !== from);
  playerService.getSocket(to)?.send(JSON.stringify({ 
    type: 'CHAT', 
    from, 
    message,
    gameId: foundGameId 
  }));
}

function endGame(gameId, winner) {
  const { gameId: foundGameId, game } = findGame(gameId, winner);
  
  if (!game || !game.active) return;
  gameId = foundGameId;

  game.active = false;
  game.winner = winner;

  game.players.forEach(player => {
    const playerSocket = playerService.getSocket(player);
    if (playerSocket) {
      playerSocket.send(JSON.stringify({
        type: 'GAME_OVER',
        winner,
        gameId
      }));
    }
  });

  // Don't immediately delete game state to allow for reconnection
  setTimeout(() => {
    // Clean up indices before deleting game
    if (game.players) {
      game.players.forEach(player => {
        if (playerGames[player] === gameId) {
          delete playerGames[player];
        }
      });
    }
    delete gameStates[gameId];
    console.log(`Game ${gameId} state cleared from memory`);
  }, 3600000);
}

function cleanupOldGames() {
  const now = Date.now();
  const oldGames = Object.entries(gameStates)
    .filter(([_, game]) => !game.active && now - game.created > 3600000);
    
  oldGames.forEach(([gameId, game]) => {
    // Clean up indices before deleting game
    if (game.players) {
      game.players.forEach(player => {
        if (playerGames[player] === gameId) {
          delete playerGames[player];
        }
      });
    }
    delete gameStates[gameId];
    console.log(`Old game ${gameId} cleared from memory`);
  });
}

function getGameState(gameId) {
  return gameStates[gameId];
}

function getActiveGame(player) {
  return findGameByPlayer(player);
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
  endGame,
  getGameState,
  getActiveGame
};