let players = [];
let sockets = {};

function register(ws, username, wss) {
  if (sockets[username] && sockets[username] !== ws) {
    console.log(`Player ${username} is reconnecting, replacing old socket`);
    sockets[username] = ws;
    ws.player = username;
    
    ws.send(JSON.stringify({ 
      type: 'REGISTRATION_SUCCESS', 
      username,
      message: 'Reconnected successfully' 
    }));
    
    ws.send(JSON.stringify({ type: 'SET_PLAYERS', players }));
    return;
  }
  
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
  
  sockets[username] = null;
  
  setTimeout(() => {
    if (!sockets[username]) {
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