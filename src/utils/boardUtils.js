const { BOARD_SIZE, BOARD_CELL_STATES } = require('./constants');

function createGameBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(BOARD_CELL_STATES.EMPTY));
}

function isValidPosition(position) {
  return position && 
    Number.isInteger(position.row) && 
    Number.isInteger(position.col) &&
    position.row >= 0 && 
    position.row < BOARD_SIZE && 
    position.col >= 0 && 
    position.col < BOARD_SIZE;
}

function updateBoardCell(board, position, state) {
  if (!isValidPosition(position)) return board;
  
  const updatedBoard = [...board];
  updatedBoard[position.row][position.col] = state;
  return updatedBoard;
}

function areAllShipsDestroyed(ships) {
  return ships.length === 0;
}

module.exports = {
  createGameBoard,
  isValidPosition,
  updateBoardCell,
  areAllShipsDestroyed
};