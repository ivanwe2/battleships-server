function createMessage(type, payload = {}) {
  return JSON.stringify({
    type,
    ...payload
  });
}

function sendMessage(socket, type, payload = {}) {
  if (socket?.readyState === 1) {
    socket.send(createMessage(type, payload));
  }
}

function broadcastMessage(clients, type, payload = {}) {
  const message = createMessage(type, payload);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

module.exports = {
  createMessage,
  sendMessage,
  broadcastMessage
};