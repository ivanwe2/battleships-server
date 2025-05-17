const WebSocket = require('ws');
const gameController = require('../controllers/gameController');
const playerService = require('../services/playerService');
const { TIME_INTERVALS, MESSAGE_TYPES } = require('../utils/constants');
const { sendMessage } = require('../utils/messageUtils');
const { sendError } = require('../utils/errorUtils');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  setupHeartbeat(wss);
  setupConnectionHandlers(wss);
  setupServerErrorHandling(wss);
  return wss;
}

function setupHeartbeat(wss) {
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, TIME_INTERVALS.HEARTBEAT);
  
  wss.on('close', () => clearInterval(heartbeatInterval));
}

function setupConnectionHandlers(wss) {
  wss.on('connection', ws => {
    initializeConnection(ws);
    
    ws.on('pong', () => ws.isAlive = true);
    ws.on('message', message => handleClientMessage(ws, message, wss));
    ws.on('close', () => handleClientDisconnect(ws, wss));
    ws.on('error', error => handleClientError(ws, error));
  });
}

function initializeConnection(ws) {
  ws.isAlive = true;
  ws.id = Date.now().toString();
  ws.player = null;
}

function handleClientMessage(ws, message, wss) {
  try {
    const data = parseMessage(message);
    
    if (data.type === MESSAGE_TYPES.REGISTER) {
      ws.player = data.username;
    }
    
    try {
      gameController.handleMessage(ws, data, wss);
    } catch (controllerError) {
      handleControllerError(ws, controllerError);
    }
  } catch (parseError) {
    console.error(e);
  }
}

function parseMessage(message) {
  return JSON.parse(message);
}

function handleControllerError(ws, error) {
  if (ws.readyState === WebSocket.OPEN) {
    sendError(ws, 'Server error processing request');
  }
}

function handleClientDisconnect(ws, wss) {
  playerService.handleDisconnect(ws, wss);
}

function handleClientError(ws, error) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      sendError(ws, 'WebSocket connection error');
    }
  } catch (e) {
    console.error(e);
  }
}

function setupServerErrorHandling(wss) {
  wss.on('error', () => {
    console.error("Internal server error");
  });
}

module.exports = setupWebSocket;