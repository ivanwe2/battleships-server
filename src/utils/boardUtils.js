const BOARD_SIZE = 10;

function createGameBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

module.exports = {
  createGameBoard
};