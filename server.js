const express = require('express');
const WebSocket = require('ws');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

let players = [];
let sockets = [];
let games = {};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'REGISTER') {
      players.push(data.username);
      sockets[data.username] = ws;
      broadcastPlayers();
    } else if (data.type === 'LOGOUT') {
      players = players.filter(player => player !== data.username);
      delete sockets[data.username];
      broadcastPlayers();
    } else if (data.type === 'INVITE') {
      const toSocket = sockets[data.to];
      if (toSocket) {
        toSocket.send(JSON.stringify({ type: 'INVITE', from: data.from }));
      }
    } else if (data.type === 'ACCEPT_INVITE') {
      const fromSocket = sockets[data.from];
      const toSocket = sockets[data.to];
      if (fromSocket && toSocket) {
        const gameId = `${data.from}-${data.to}`;
        games[gameId] = { players: [data.from, data.to], board: {} };
        fromSocket.send(JSON.stringify({ type: 'START_GAME', opponent: data.to, gameId }));
        toSocket.send(JSON.stringify({ type: 'START_GAME', opponent: data.from, gameId }));
      }
    } else if (data.type === 'ATTACK') {
      const game = games[data.gameId];
      if (game) {
        const opponent = game.players.find(player => player !== data.player);
        const opponentSocket = sockets[opponent];
        if (opponentSocket) {
          opponentSocket.send(JSON.stringify({ type: 'ATTACK', position: data.position }));
        }
      }
    }
  });

  ws.send(JSON.stringify({ type: 'SET_PLAYERS', players }));

  ws.on('close', () => {
    const username = Object.keys(sockets).find(key => sockets[key] === ws);
    if (username) {
      players = players.filter(player => player !== username);
      delete sockets[username];
      broadcastPlayers();
    }
  });
});

function broadcastPlayers() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'SET_PLAYERS', players }));
    }
  });
}

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});