const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Store player information
let players = [];
let sockets = {};

// Store game information
let games = {};
let gameStates = {};

// Constants
const BOARD_SIZE = 10;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 }
];

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleMessage(ws, data) {
  console.log('Received message:', data.type);

  switch (data.type) {
    case 'REGISTER':
      handleRegister(ws, data);
      break;
    case 'LOGOUT':
      handleLogout(data);
      break;
    case 'INVITE':
      handleInvite(data);
      break;
    case 'ACCEPT_INVITE':
      handleAcceptInvite(data);
      break;
    case 'JOIN_GAME':
      handleJoinGame(ws, data);
      break;
    case 'LEAVE_GAME':
      handleLeaveGame(data);
      break;
    case 'SHIPS_PLACED':
      handleShipsPlaced(data);
      break;
    case 'ATTACK':
      handleAttack(data);
      break;
    case 'ATTACK_RESULT':
      handleAttackResult(data);
      break;
    case 'CHAT':
      handleChat(data);
      break;
    case 'GAME_OVER':
      handleGameOver(data);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

function handleRegister(ws, data) {
  const { username } = data;

  // Check if username is already taken
  if (players.includes(username)) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'Username already taken.'
    }));
    return;
  }

  players.push(username);
  sockets[username] = ws;
  
  // Send current player list to the new player
  ws.send(JSON.stringify({
    type: 'SET_PLAYERS',
    players
  }));

  // Broadcast updated player list to all clients
  broadcastPlayers();

  console.log(`Player ${username} registered`);
}

function handleLogout(data) {
  const { username } = data;
  players = players.filter(player => player !== username);
  delete sockets[username];
  broadcastPlayers();
  console.log(`Player ${username} logged out`);
}

function handleInvite(data) {
  const { from, to } = data;
  const toSocket = sockets[to];
  
  if (toSocket) {
    toSocket.send(JSON.stringify({
      type: 'INVITE',
      from
    }));
    console.log(`Invite sent from ${from} to ${to}`);
  } else {
    console.log(`Player ${to} not found or offline`);
  }
}

function handleAcceptInvite(data) {
  const { from, to } = data;
  const fromSocket = sockets[from];
  const toSocket = sockets[to];
  
  if (fromSocket && toSocket) {
    const gameId = `${from}-${to}`;
    
    // Initialize game state
    gameStates[gameId] = {
      players: [from, to],
      readyPlayers: [],
      boards: {
        [from]: Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null)),
        [to]: Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null))
      },
      ships: {
        [from]: [],
        [to]: []
      },
      turn: null
    };
    
    // Notify both players to start the game
    fromSocket.send(JSON.stringify({
      type: 'START_GAME',
      opponent: to,
      gameId
    }));
    
    toSocket.send(JSON.stringify({
      type: 'START_GAME',
      opponent: from,
      gameId
    }));
    
    console.log(`Game ${gameId} started between ${from} and ${to}`);
  }
}

function handleJoinGame(ws, data) {
  const { gameId, player } = data;
  
  if (!gameStates[gameId]) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'Game not found'
    }));
    return;
  }
  
  // Store socket reference for game communications
  sockets[player] = ws;
  
  // Notify other player
  const opponent = gameStates[gameId].players.find(p => p !== player);
  if (opponent && sockets[opponent]) {
    sockets[opponent].send(JSON.stringify({
      type: 'GAME_JOINED',
      player
    }));
  }
  
  ws.send(JSON.stringify({
    type: 'GAME_JOINED',
    player
  }));
  
  console.log(`Player ${player} joined game ${gameId}`);
}

function handleLeaveGame(data) {
  const { gameId, player } = data;
  
  if (!gameStates[gameId]) return;
  
  // Notify other player
  const opponent = gameStates[gameId].players.find(p => p !== player);
  if (opponent && sockets[opponent]) {
    sockets[opponent].send(JSON.stringify({
      type: 'GAME_LEFT',
      player
    }));
  }
  
  console.log(`Player ${player} left game ${gameId}`);
}

function handleShipsPlaced(data) {
  const { gameId, player } = data;
  
  if (!gameStates[gameId]) return;
  
  // Mark player as ready
  if (!gameStates[gameId].readyPlayers.includes(player)) {
    gameStates[gameId].readyPlayers.push(player);
  }
  
  // Notify other player
  const opponent = gameStates[gameId].players.find(p => p !== player);
  if (opponent && sockets[opponent]) {
    sockets[opponent].send(JSON.stringify({
      type: 'SHIPS_PLACED',
      player
    }));
  }
  
  // If both players are ready, start the game
  if (gameStates[gameId].readyPlayers.length === 2) {
    // Randomly determine first player
    const firstPlayer = Math.random() < 0.5 
      ? gameStates[gameId].players[0] 
      : gameStates[gameId].players[1];
    
    gameStates[gameId].turn = firstPlayer;
    
    // Notify both players
    gameStates[gameId].players.forEach(p => {
      if (sockets[p]) {
        sockets[p].send(JSON.stringify({
          type: 'GAME_READY',
          firstPlayer
        }));
      }
    });
    
    console.log(`Game ${gameId} started, ${firstPlayer} goes first`);
  }
}

function handleAttack(data) {
  const { gameId, attacker, defender, position } = data;
  
  if (!gameStates[gameId]) return;
  
  // Check if it's the attacker's turn
  if (gameStates[gameId].turn !== attacker) {
    if (sockets[attacker]) {
      sockets[attacker].send(JSON.stringify({
        type: 'ERROR',
        message: 'Not your turn'
      }));
    }
    return;
  }
  
  // Forward attack to defender
  if (sockets[defender]) {
    sockets[defender].send(JSON.stringify({
      type: 'ATTACK',
      attacker,
      position
    }));
  }
  
  console.log(`${attacker} attacked ${defender} at ${position.row},${position.col}`);
}

function handleAttackResult(data) {
  const { gameId, attacker, defender, position, hit, shipDestroyed } = data;
  
  if (!gameStates[gameId]) return;
  
  // Update turn unless it was a hit (in battleship, hits get another turn)
  if (!hit) {
    gameStates[gameId].turn = defender;
  }
  
  // Forward result to attacker
  if (sockets[attacker]) {
    sockets[attacker].send(JSON.stringify({
      type: 'ATTACK_RESULT',
      attacker,
      defender,
      position,
      hit,
      shipDestroyed
    }));
  }
  
  console.log(`Attack result: ${hit ? 'Hit' : 'Miss'}${shipDestroyed ? `, destroyed ${shipDestroyed}` : ''}`);
}

function handleChat(data) {
  const { gameId, from, message } = data;
  
  if (!gameStates[gameId]) return;
  
  // Forward message to other player
  const to = gameStates[gameId].players.find(p => p !== from);
  if (to && sockets[to]) {
    sockets[to].send(JSON.stringify({
      type: 'CHAT',
      from,
      message
    }));
  }
}

function handleGameOver(data) {
  const { gameId, winner } = data;
  
  if (!gameStates[gameId]) return;
  
  // Notify both players
  gameStates[gameId].players.forEach(player => {
    if (sockets[player]) {
      sockets[player].send(JSON.stringify({
        type: 'GAME_OVER',
        winner
      }));
    }
  });
  
  console.log(`Game ${gameId} over, ${winner} wins!`);
}

function handleDisconnect(ws) {
  // Find the disconnected player
  const username = Object.keys(sockets).find(key => sockets[key] === ws);
  
  if (username) {
    console.log(`Player ${username} disconnected`);
    
    // Remove from players list
    players = players.filter(player => player !== username);
    delete sockets[username];
    
    // Check if player is in any games
    Object.keys(gameStates).forEach(gameId => {
      if (gameStates[gameId].players.includes(username)) {
        const opponent = gameStates[gameId].players.find(p => p !== username);
        
        // Notify opponent
        if (opponent && sockets[opponent]) {
          sockets[opponent].send(JSON.stringify({
            type: 'GAME_LEFT',
            player: username
          }));
        }
      }
    });
    
    // Broadcast updated player list
    broadcastPlayers();
  }
}

function broadcastPlayers() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'SET_PLAYERS',
        players
      }));
    }
  });
}

// Check for environment variable or use default port
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});