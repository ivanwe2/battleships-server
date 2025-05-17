const playerService = require('./playerService');
const gameRepository = require('../repositories/gameRepository');
const { MESSAGE_TYPES, TIME_INTERVALS } = require('../utils/constants');
const { sendMessage } = require('../utils/messageUtils');

class GameService {
  createGame(ws, player) {
    const { gameId: existingGameId } = gameRepository.findGameByPlayer(player);
    const existingGame = existingGameId ? gameRepository.getGame(existingGameId) : null;
    
    if (existingGame && existingGame.active) {
      sendMessage(ws, MESSAGE_TYPES.ERROR, {
        message: 'You are already in a game'
      });
      return;
    }

    const gameId = `${player}-${Date.now()}`;
    const game = gameRepository.createGame(player, gameId);
    
    sendMessage(ws, MESSAGE_TYPES.GAME_CREATED, { gameId });
  }

  invite(from, to) {
    const toSocket = playerService.getSocket(to);
    if (toSocket) {
      sendMessage(toSocket, MESSAGE_TYPES.INVITE, { from });
    }
  }

  acceptInvite(from, to) {
    const fromSocket = playerService.getSocket(from);
    const toSocket = playerService.getSocket(to);
    if (!fromSocket || !toSocket) return;

    const gameId = `${from}-${to}-${Date.now()}`;
    const game = gameRepository.createTwoPlayerGame(from, to, gameId);
    
    const startGamePayload = { gameId };
    sendMessage(fromSocket, MESSAGE_TYPES.START_GAME, { 
      ...startGamePayload, 
      opponent: to 
    });
    
    sendMessage(toSocket, MESSAGE_TYPES.START_GAME, { 
      ...startGamePayload, 
      opponent: from 
    });
  }

  joinGame(ws, gameId, player) {
    let gameInfo = gameRepository.findGameByPlayer(player);
    
    if (!gameInfo.game) {
      gameInfo = gameRepository.findGame(gameId, player);
    }
    
    const { gameId: foundGameId, game } = gameInfo;
    
    if (!game) {
      sendMessage(ws, MESSAGE_TYPES.ERROR, { message: 'Game not found' });
      return;
    }
    
    if (game.isPlayerInGame(player)) {
      return this._handleReconnection(ws, foundGameId, player, game);
    }

    if (game.waitingForOpponent && game.players.length === 1) {
      return this._handleJoiningWaitingGame(ws, foundGameId, player, game);
    }

    sendMessage(ws, MESSAGE_TYPES.ERROR, { message: 'Game is full' });
  }
  
  _handleReconnection(ws, gameId, player, game) {
    const opponent = game.getOpponent(player);
    
    gameRepository.registerPlayerGame(player, gameId);
    
    sendMessage(ws, MESSAGE_TYPES.RECONNECTED, { 
      gameId,
      opponent,
      gamePhase: game.getGamePhase()
    });
  }
  
  _handleJoiningWaitingGame(ws, gameId, player, game) {
    const hostPlayer = game.players[0];
    
    if (hostPlayer === player) {
      sendMessage(ws, MESSAGE_TYPES.ERROR, { message: 'Cannot join your own game' });
      return;
    }
    
    game.addPlayer(player);
    gameRepository.registerPlayerGame(player, gameId);
    
    const hostSocket = playerService.getSocket(hostPlayer);
    if (hostSocket) {
      sendMessage(hostSocket, MESSAGE_TYPES.GAME_JOINED, {
        player,
        gameId
      });
    }
    
    sendMessage(ws, MESSAGE_TYPES.START_GAME, {
      opponent: hostPlayer,
      gameId
    });
  }

  leaveGame(gameId, player) {
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, player);
    
    if (!game) return;
    gameId = foundGameId;

    const opponent = game.getOpponent(player);
    const opponentSocket = playerService.getSocket(opponent);
    
    if (opponentSocket) {
      sendMessage(opponentSocket, MESSAGE_TYPES.GAME_LEFT, { 
        player,
        gameId 
      });
    }
    
    if (game.getGamePhase() === 'placement') {
      gameRepository.deleteGame(gameId);
    } else {
      gameRepository.markGameInactive(gameId);
    }
  }

  placeShips(gameId, player, ships) {
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, player);
    
    if (!game) return;
    gameId = foundGameId;

    gameRepository.registerPlayerGame(player, gameId);
    
    const allReady = game.addShips(player, ships);
    const opponent = game.getOpponent(player);
    
    const opponentSocket = playerService.getSocket(opponent);
    if (opponentSocket) {
      sendMessage(opponentSocket, MESSAGE_TYPES.SHIPS_PLACED, {
        player,
        gameId
      });
    }

    if (allReady) {
      const firstPlayer = game.setFirstPlayer();
      this._notifyGameReady(game, firstPlayer, gameId);
    }
  }
  
  _notifyGameReady(game, firstPlayer, gameId) {
    game.players.forEach(player => {
      const playerSocket = playerService.getSocket(player);
      if (playerSocket) {
        sendMessage(playerSocket, MESSAGE_TYPES.GAME_READY, {
          firstPlayer,
          gameId
        });
      }
    });
  }

  attack(data) {
    const { gameId, attacker, defender, position } = data;
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, attacker);
    
    if (!game || !game.active) {
      sendMessage(playerService.getSocket(attacker), MESSAGE_TYPES.ERROR, {
        message: 'Game not found or inactive'
      });
      return;
    }
    
    if (!game.isPlayerTurn(attacker)) {
      sendMessage(playerService.getSocket(attacker), MESSAGE_TYPES.ERROR, {
        message: 'Not your turn'
      });
      return;
    }

    const defenderSocket = playerService.getSocket(defender);
    if (defenderSocket) {
      sendMessage(defenderSocket, MESSAGE_TYPES.ATTACK, {
        attacker,
        position,
        gameId: foundGameId
      });
    } else {
      this._handleOfflineDefender(game, attacker, defender, position, foundGameId);
    }
  }
  
  _handleOfflineDefender(game, attacker, defender, position, gameId) {
    sendMessage(playerService.getSocket(attacker), MESSAGE_TYPES.ATTACK_RESULT, {
      attacker,
      defender,
      position,
      hit: false,
      shipDestroyed: null,
      gameId
    });
    
    game.setTurn(defender);
  }

  attackResult(data) {
    const { gameId, attacker, defender, position, hit, shipDestroyed } = data;
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, attacker);
    
    if (!game || !game.active) return;

    game.markCellAttacked(defender, position, hit);
    
    if (!hit) {
      game.setTurn(defender);
    }

    const attackerSocket = playerService.getSocket(attacker);
    if (attackerSocket) {
      sendMessage(attackerSocket, MESSAGE_TYPES.ATTACK_RESULT, {
        attacker,
        defender,
        position,
        hit,
        shipDestroyed,
        gameId: foundGameId
      });
    }

    if (shipDestroyed) {
      game.removeShip(defender, shipDestroyed);
      
      if (game.areAllShipsDestroyed(defender)) {
        this.endGame(foundGameId, attacker);
      }
    }
  }

  chat(data) {
    const { gameId, from, message } = data;
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, from);
    
    if (!game || !game.active) return;
    
    const to = game.getOpponent(from);
    const toSocket = playerService.getSocket(to);
    
    if (toSocket) {
      sendMessage(toSocket, MESSAGE_TYPES.CHAT, { 
        from, 
        message,
        gameId: foundGameId 
      });
    }
  }

  endGame(gameId, winner) {
    const { gameId: foundGameId, game } = gameRepository.findGame(gameId, winner);
    
    if (!game || !game.active) return;
    
    game.endGame(winner);
    
    this._notifyGameOver(game, winner, foundGameId);
    gameRepository.scheduleGameDeletion(foundGameId, TIME_INTERVALS.GAME_CLEANUP);
  }
  
  _notifyGameOver(game, winner, gameId) {
    game.players.forEach(player => {
      const playerSocket = playerService.getSocket(player);
      if (playerSocket) {
        sendMessage(playerSocket, MESSAGE_TYPES.GAME_OVER, {
          winner,
          gameId
        });
      }
    });
  }

  getGameState(gameId) {
    return gameRepository.getGame(gameId);
  }

  getActiveGame(player) {
    return gameRepository.findGameByPlayer(player);
  }
}

module.exports = new GameService();