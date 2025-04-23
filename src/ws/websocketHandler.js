const WebSocket = require('ws');
const gameController = require('../controllers/gameController');
const playerService = require('../services/playerService');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        console.log('Client failed heartbeat, terminating');
        return ws.terminate();
      }
      
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
        
        // Handle potential errors
        try {
          gameController.handleMessage(ws, data, wss);
        } catch (controllerError) {
          console.error('Error in game controller:', controllerError);
          // Inform client of error
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Server error processing request'
            }));
          }
        }
      } catch (parseError) {
        console.error('Invalid JSON message:', parseError);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      playerService.handleDisconnect(ws, wss);
    });
    
    ws.on('error', error => {
      console.error('WebSocket error:', error);
      // Try to send an error message if possible
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'WebSocket connection error'
          }));
        }
      } catch (e) {
        console.error('Failed to send error message to client:', e);
      }
    });
  });

  wss.on('close', () => clearInterval(heartbeatInterval));
  
  // Handle server errors to prevent crashes
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
  
  return wss;
}

module.exports = setupWebSocket;