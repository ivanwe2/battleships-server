const { MESSAGE_TYPES, TIME_INTERVALS } = require('../utils/constants');
const { sendMessage, broadcastMessage } = require('../utils/messageUtils');
const { sendError } = require('../utils/errorUtils');

class PlayerService {
  constructor() {
    this.players = [];
    this.sockets = {};
  }

  register(ws, username, wss) {
    const isReconnecting = this.sockets[username] && this.sockets[username] !== ws;
    
    if (isReconnecting) {
      return this._handleReconnection(ws, username, wss);
    }
    
    return this._handleNewRegistration(ws, username, wss);
  }

  _handleReconnection(ws, username, wss) {
    this.sockets[username] = ws;
    ws.player = username;
    
    sendMessage(ws, MESSAGE_TYPES.REGISTRATION_SUCCESS, { 
      username,
      message: 'Reconnected successfully' 
    });
    
    sendMessage(ws, MESSAGE_TYPES.SET_PLAYERS, { players: this.players });
    
    return { username, reconnected: true };
  }

  _handleNewRegistration(ws, username, wss) {
    if (!this.players.includes(username)) {
      this.players.push(username);
    }
    
    this.sockets[username] = ws;
    ws.player = username;

    sendMessage(ws, MESSAGE_TYPES.REGISTRATION_SUCCESS, { 
      username,
      message: 'Registered successfully' 
    });
    
    sendMessage(ws, MESSAGE_TYPES.SET_PLAYERS, { players: this.players });
    this.broadcastPlayers(wss);
    
    return { username, reconnected: false };
  }

  logout(username, wss) {
    this.players = this.players.filter(p => p !== username);
    delete this.sockets[username];
    this.broadcastPlayers(wss);
  }

  handleDisconnect(ws, wss) {
    const username = this._getUsernameFromSocket(ws);
    if (!username) return;
    
    this.sockets[username] = null;
    
    setTimeout(() => {
      this._cleanupPlayerAfterTimeout(username, wss);
    }, TIME_INTERVALS.PLAYER_DISCONNECT);
  }

  _cleanupPlayerAfterTimeout(username, wss) {
    if (!this.sockets[username]) {
      this.players = this.players.filter(p => p !== username);
      delete this.sockets[username];
      this.broadcastPlayers(wss);
    }
  }

  _getUsernameFromSocket(ws) {
    return ws.player || Object.keys(this.sockets).find(k => this.sockets[k] === ws);
  }

  broadcastPlayers(wss) {
    broadcastMessage(wss.clients, MESSAGE_TYPES.SET_PLAYERS, { players: this.players });
  }

  getSocket(username) {
    return this.sockets[username];
  }

  isPlayerOnline(username) {
    return !!this.sockets[username];
  }
}

module.exports = new PlayerService();