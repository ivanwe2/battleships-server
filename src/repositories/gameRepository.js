const { TIME_INTERVALS } = require('../utils/constants');
const GameState = require('../models/GameState');

class GameRepository {
  constructor() {
    this.gameStates = {};
    this.playerGames = {};
    
    setInterval(() => this.cleanupOldGames(), TIME_INTERVALS.GAME_CLEANUP);
  }
  
  createGame(player, gameId) {
    const newGame = new GameState(player, gameId);
    this.gameStates[gameId] = newGame;
    this.playerGames[player] = gameId;
    
    return newGame;
  }
  
  createTwoPlayerGame(player1, player2, gameId) {
    const newGame = new GameState([player1, player2], gameId);
    this.gameStates[gameId] = newGame;
    this.playerGames[player1] = gameId;
    this.playerGames[player2] = gameId;
    
    return newGame;
  }
  
  getGame(gameId) {
    return this.gameStates[gameId];
  }
  
  findGameByPlayer(player) {
    const gameId = this.playerGames[player];
    if (gameId && this.gameStates[gameId]?.active) {
      return { gameId, game: this.gameStates[gameId] };
    }
    
    for (const [id, game] of Object.entries(this.gameStates)) {
      if (game.active && game.isPlayerInGame(player)) {
        this.playerGames[player] = id;
        return { gameId: id, game };
      }
    }
    
    return { gameId: null, game: null };
  }
  
  findGame(gameId, player) {
    if (player) {
      const playerGame = this.findGameByPlayer(player);
      if (playerGame.game) {
        return playerGame;
      }
    }
    
    if (gameId && this.gameStates[gameId]?.active) {
      return { gameId, game: this.gameStates[gameId] };
    }
    
    if (gameId) {
      const playerName = gameId.split('-')[0];
      if (playerName) {
        return this.findGameByPlayer(playerName);
      }
    }
    
    const recentGame = this._findMostRecentActiveGame();
    return recentGame;
  }
  
  _findMostRecentActiveGame() {
    const allGames = Object.entries(this.gameStates)
      .filter(([_, g]) => g.active)
      .sort((a, b) => b[1].created - a[1].created);
    
    if (allGames.length > 0) {
      return { gameId: allGames[0][0], game: allGames[0][1] };
    }
    
    return { gameId: null, game: null };
  }
  
  deleteGame(gameId) {
    const game = this.gameStates[gameId];
    if (!game) return false;
    
    game.players.forEach(player => {
      if (this.playerGames[player] === gameId) {
        delete this.playerGames[player];
      }
    });
    
    delete this.gameStates[gameId];
    return true;
  }
  
  markGameInactive(gameId) {
    const game = this.gameStates[gameId];
    if (!game) return false;
    
    game.active = false;
    return true;
  }
  
  scheduleGameDeletion(gameId, delay = TIME_INTERVALS.GAME_CLEANUP) {
    setTimeout(() => {
      this.deleteGame(gameId);
    }, delay);
  }
  
  cleanupOldGames() {
    const now = Date.now();
    const oldGames = Object.entries(this.gameStates)
      .filter(([_, game]) => !game.active && now - game.created > TIME_INTERVALS.GAME_CLEANUP);
      
    oldGames.forEach(([gameId]) => this.deleteGame(gameId));
  }
  
  registerPlayerGame(player, gameId) {
    this.playerGames[player] = gameId;
  }
}

module.exports = new GameRepository();