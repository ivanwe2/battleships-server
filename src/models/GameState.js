const { BOARD_CELL_STATES } = require('../utils/constants');
const { createGameBoard } = require('../utils/boardUtils');

class GameState {
  constructor(players, id) {
    this.id = id;
    this.players = Array.isArray(players) ? [...players] : [players];
    this.readyPlayers = [];
    this.boards = {};
    this.ships = {};
    this.turn = null;
    this.waitingForOpponent = this.players.length === 1;
    this.active = true;
    this.created = Date.now();
    this.winner = null;
    
    this._initializePlayerData();
  }
  
  _initializePlayerData() {
    this.players.forEach(player => {
      this.boards[player] = createGameBoard();
      this.ships[player] = [];
    });
  }
  
  addPlayer(player) {
    if (this.players.includes(player)) return false;
    
    this.players.push(player);
    this.boards[player] = createGameBoard();
    this.ships[player] = [];
    this.waitingForOpponent = false;
    
    return true;
  }
  
  isPlayerInGame(player) {
    return this.players.includes(player);
  }
  
  getOpponent(player) {
    return this.players.find(p => p !== player);
  }
  
  addShips(player, ships) {
    this.ships[player] = ships;
    
    if (!this.readyPlayers.includes(player)) {
      this.readyPlayers.push(player);
    }
    
    return this.readyPlayers.length === 2;
  }
  
  markCellAttacked(player, position, hit) {
    if (!this.boards[player]) this.boards[player] = createGameBoard();
    this.boards[player][position.row][position.col] = hit ? 
      BOARD_CELL_STATES.HIT : BOARD_CELL_STATES.MISS;
    
    return this.boards[player];
  }
  
  removeShip(player, shipId) {
    if (!this.ships[player]) return false;
    
    const initialLength = this.ships[player].length;
    this.ships[player] = this.ships[player].filter(s => s.id !== shipId);
    
    return initialLength !== this.ships[player].length;
  }
  
  areAllShipsDestroyed(player) {
    return this.ships[player]?.length === 0;
  }
  
  setFirstPlayer() {
    this.turn = Math.random() < 0.5 ? this.players[0] : this.players[1];
    return this.turn;
  }
  
  setTurn(player) {
    if (this.players.includes(player)) {
      this.turn = player;
      return true;
    }
    return false;
  }
  
  isPlayerTurn(player) {
    return this.turn === player;
  }
  
  endGame(winner) {
    this.active = false;
    this.winner = winner;
  }
  
  getGamePhase() {
    return this.readyPlayers.length === 2 ? 'battle' : 'placement';
  }
}

module.exports = GameState;