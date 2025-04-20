const http = require('http');
const app = require('./app');
const setupWebSocket = require('./ws/websocketHandler');

const server = http.createServer(app);
setupWebSocket(server);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});