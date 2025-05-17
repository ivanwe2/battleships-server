const playerService = require('../services/playerService');
const gameService = require('../services/gameService');
const { MESSAGE_TYPES } = require('../utils/constants');

class GameController {
  handleMessage(ws, data, wss) {
    const handlers = this._getMessageHandlers();
    const handler = handlers[data.type];
    
    if (handler) {
      return handler(ws, data, wss);
    }
    
    return this._handleUnknownMessageType(data.type);
  }
  
  _getMessageHandlers() {
    return {
      [MESSAGE_TYPES.REGISTER]: (ws, data, wss) => 
        playerService.register(ws, data.username, wss),
        
      [MESSAGE_TYPES.LOGOUT]: (ws, data, wss) => 
        playerService.logout(data.username, wss),
        
      [MESSAGE_TYPES.INVITE]: (ws, data) => 
        gameService.invite(data.from, data.to),
        
      [MESSAGE_TYPES.ACCEPT_INVITE]: (ws, data) => 
        gameService.acceptInvite(data.from, data.to),
        
      [MESSAGE_TYPES.CREATE_GAME]: (ws, data) => 
        gameService.createGame(ws, data.player),
        
      [MESSAGE_TYPES.JOIN_GAME]: (ws, data) => 
        gameService.joinGame(ws, data.gameId, data.player),
        
      [MESSAGE_TYPES.LEAVE_GAME]: (ws, data) => 
        gameService.leaveGame(data.gameId, data.player),
        
      [MESSAGE_TYPES.SHIPS_PLACED]: (ws, data) => 
        gameService.placeShips(data.gameId, data.player, data.ships),
        
      [MESSAGE_TYPES.ATTACK]: (ws, data) => 
        gameService.attack(data),
        
      [MESSAGE_TYPES.ATTACK_RESULT]: (ws, data) => 
        gameService.attackResult(data),
        
      [MESSAGE_TYPES.CHAT]: (ws, data) => 
        gameService.chat(data),
        
      [MESSAGE_TYPES.GAME_OVER]: (ws, data) => 
        gameService.endGame(data.gameId, data.winner)
    };
  }
  
  _handleUnknownMessageType(type) {
    // swallow
  }
}

module.exports = new GameController();