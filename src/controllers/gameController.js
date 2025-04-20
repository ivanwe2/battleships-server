const playerService = require('../services/playerService');
const gameService = require('../services/gameService');

function handleMessage(ws, data, wss) {
  switch (data.type) {
    case 'REGISTER': return playerService.register(ws, data.username, wss);
    case 'LOGOUT': return playerService.logout(data.username, wss);
    case 'INVITE': return gameService.invite(data.from, data.to);
    case 'ACCEPT_INVITE': return gameService.acceptInvite(data.from, data.to);
    case 'JOIN_GAME': return gameService.joinGame(ws, data.gameId, data.player);
    case 'LEAVE_GAME': return gameService.leaveGame(data.gameId, data.player);
    case 'SHIPS_PLACED': return gameService.placeShips(data.gameId, data.player, data.ships);
    case 'ATTACK': return gameService.attack(data);
    case 'ATTACK_RESULT': return gameService.attackResult(data);
    case 'CHAT': return gameService.chat(data);
    case 'GAME_OVER': return gameService.endGame(data.gameId, data.winner);
    default: console.warn('Unknown message type:', data.type);
  }
}

module.exports = { handleMessage };