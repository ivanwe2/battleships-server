const playerService = require('./playerService');
const { createGameBoard } = require('../utils/boardUtils');

let gameStates = {};

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
    turn: null
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

function joinGame(ws, gameId, player) {
  if (!gameStates[gameId]) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  playerService.getSocket(player)?.send(JSON.stringify({
    type: 'GAME_JOINED',
    player
  }));
}

function leaveGame(gameId, player) {
  if (!gameStates[gameId]) return;

  const opponent = gameStates[gameId].players.find(p => p !== player);
  const opponentSocket = playerService.getSocket(opponent);
  if (opponentSocket) {
    opponentSocket.send(JSON.stringify({ type: 'GAME_LEFT', player }));
  }
}

function placeShips(gameId, player, ships) {
  if (!gameStates[gameId]) return;

  gameStates[gameId].ships[player] = ships;
  if (!gameStates[gameId].readyPlayers.includes(player)) {
    gameStates[gameId].readyPlayers.push(player);
  }

  const opponent = gameStates[gameId].players.find(p => p !== player);
  playerService.getSocket(opponent)?.send(JSON.stringify({
    type: 'SHIPS_PLACED',
    player
  }));

  if (gameStates[gameId].readyPlayers.length === 2) {
    const first = Math.random() < 0.5 ? gameStates[gameId].players[0] : gameStates[gameId].players[1];
    gameStates[gameId].turn = first;
    gameStates[gameId].players.forEach(p => {
      playerService.getSocket(p)?.send(JSON.stringify({
        type: 'GAME_READY',
        firstPlayer: first
      }));
    });
  }
}

function attack({ gameId, attacker, defender, position }) {
  const game = gameStates[gameId];
  if (!game || game.turn !== attacker) {
    playerService.getSocket(attacker)?.send(JSON.stringify({
      type: 'ERROR',
      message: 'Not your turn'
    }));
    return;
  }

  playerService.getSocket(defender)?.send(JSON.stringify({
    type: 'ATTACK',
    attacker,
    position
  }));
}

function attackResult({ gameId, attacker, defender, position, hit, shipDestroyed }) {
  const game = gameStates[gameId];
  if (!game) return;

  game.boards[defender][position.row][position.col] = hit ? 'hit' : 'miss';
  if (!hit) game.turn = defender;

  playerService.getSocket(attacker)?.send(JSON.stringify({
    type: 'ATTACK_RESULT',
    attacker,
    defender,
    position,
    hit,
    shipDestroyed
  }));

  if (shipDestroyed) {
    game.ships[defender] = game.ships[defender].filter(s => s.name !== shipDestroyed);
    if (game.ships[defender].length === 0) {
      endGame(gameId, attacker);
    }
  }
}

function chat({ gameId, from, message }) {
  const to = gameStates[gameId]?.players.find(p => p !== from);
  playerService.getSocket(to)?.send(JSON.stringify({ type: 'CHAT', from, message }));
}

function endGame(gameId, winner) {
  if (!gameStates[gameId]) return;

  gameStates[gameId].players.forEach(player => {
    playerService.getSocket(player)?.send(JSON.stringify({
      type: 'GAME_OVER',
      winner
    }));
  });

  delete gameStates[gameId];
}

module.exports = {
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