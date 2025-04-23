const WebSocket = require('ws');
const gameController = require('../controllers/gameController');
const playerService = require('../services/playerService');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', ws => {
    console.log('WebSocket client connected');
    ws.isAlive = true;

    ws.id = Date.now().toString();
    ws.player = null;

    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', message => {
      try {
        const data = JSON.parse(message);
        console.log('Received message:', data);
        
        if (data.type === 'REGISTER') {
          ws.player = data.username;
        }
        
        gameController.handleMessage(ws, data, wss);
      } catch (error) {
        console.error('Invalid JSON message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      playerService.handleDisconnect(ws, wss);
    });
    
    ws.on('error', error => console.error('WebSocket error:', error));
  });

  wss.on('close', () => clearInterval(heartbeatInterval));
}

module.exports = setupWebSocket;