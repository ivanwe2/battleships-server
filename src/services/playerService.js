let players = [];
let sockets = {};

function register(ws, username, wss) {
  if (players.includes(username)) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Username already taken' }));
    return;
  }

  players.push(username);
  sockets[username] = ws;

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
  const username = Object.keys(sockets).find(k => sockets[k] === ws);
  if (!username) return;

  console.log(`Player ${username} disconnected`);
  players = players.filter(p => p !== username);
  delete sockets[username];
  broadcastPlayers(wss);
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

module.exports = {
  register,
  logout,
  handleDisconnect,
  getSocket,
  broadcastPlayers
};