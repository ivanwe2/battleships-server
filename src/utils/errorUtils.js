const { MESSAGE_TYPES } = require('./constants');

class GameError extends Error {
  constructor(message, errorType = 'GAME_ERROR') {
    super(message);
    this.name = errorType;
  }
}

function createErrorMessage(message) {
  return {
    type: MESSAGE_TYPES.ERROR,
    message
  };
}

function sendError(socket, message) {
  if (socket?.readyState === 1) {
    socket.send(JSON.stringify(createErrorMessage(message)));
  }
}

module.exports = {
  GameError,
  createErrorMessage,
  sendError
};