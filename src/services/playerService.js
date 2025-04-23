let players = [];
let sockets = {};
const gameService = require('./gameService');

function register(ws, username, wss) {
  // Handle reconnection case
  if (sockets[username] && sockets[username] !== ws) {
    console.log(`Player ${username} is reconnecting, replacing old socket`);
    
    // Replace socket
    sockets[username] = ws;
    ws.player = username;
    
    // Check if player is in a game
    const { gameId, game } = gameService.getActiveGame(username);
    
    // Success message
    ws.send(JSON.stringify({ 
      type: 'REGISTRATION_SUCCESS', 
      username,
      message: 'Reconnected successfully' 
    }));
    
    // Set players list
    ws.send(JSON.stringify({ type: 'SET_PLAYERS', players }));
    
    // If in a game, send game state
    if (game && gameId) {
      const opponent = game.players.find(p => p !== username);
      
      // Tell client they're in a game
      ws.send(JSON.stringify({ 
        type: 'RECONNECTED', 
        gameId,
        opponent,
        gamePhase: game.readyPlayers.length === 2 ? 'battle' : 'placement'
      }));
      
      console.log(`Player ${username} reconnected to game ${gameId}`);
    }
    
    return;
  }
  
  // New registration case
  if (!players.includes(username)) {
    players.push(username);
  }
  
  sockets[username] = ws;
  ws.player = username;

  ws.send(JSON.stringify({ 
    type: 'REGISTRATION_SUCCESS', 
    username,
    message: 'Registered successfully' 
  }));
  
  ws.send(JSON.stringify({ type: 'SET_PLAYERS', players }));
  broadcastPlayers(wss);
  console.log(`Player ${username} registered`);
  
  // Check if player was in a game before registering
  const { gameId, game } = gameService.getActiveGame(username);
  if (game && gameId) {
    const opponent = game.players.find(p => p !== username);
    
    // Tell client they're in a game
    ws.send(JSON.stringify({ 
      type: 'RECONNECTED', 
      gameId,
      opponent,
      gamePhase: game.readyPlayers.length === 2 ? 'battle' : 'placement'
    }));
    
    console.log(`Player ${username} reconnected to game ${gameId}`);
  }
}

function logout(username, wss) {
  players = players.filter(p => p !== username);
  delete sockets[username];
  broadcastPlayers(wss);
  console.log(`Player ${username} logged out`);
}

function handleDisconnect(ws, wss) {
  const username = ws.player || Object.keys(sockets).find(k => sockets[k] === ws);
  if (!username) return;

  console.log(`Player ${username} disconnected`);
  
  // Keep the player in the list but mark socket as null
  sockets[username] = null;
  
  // Don't remove the player immediately to allow for reconnection
  setTimeout(() => {
    if (!sockets[username]) {
      // Only remove from players list after timeout
      players = players.filter(p => p !== username);
      delete sockets[username];
      broadcastPlayers(wss);
      console.log(`Player ${username} removed after timeout`);
    }
  }, 60000);
}

function broadcastPlayers(wss) {
  const data = JSON.stringify({ type: 'SET_PLAYERS', players });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

function getSocket(username) {
  return sockets[username];
}

function isPlayerOnline(username) {
  return !!sockets[username];
}

module.exports = {
  register,
  logout,
  handleDisconnect,
  getSocket,
  broadcastPlayers,
  isPlayerOnline
};