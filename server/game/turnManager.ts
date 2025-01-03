import { GameState } from '../types/game';

const TURN_DURATION = 30000; // 30 seconds

export function initializeTurn(gameState: GameState): GameState {
  return {
    ...gameState,
    turnStartTime: Date.now(),
    currentTurn: gameState.currentTurn + 1
  };
}

export function checkTurnTimeout(gameState: GameState): boolean {
  const elapsed = Date.now() - gameState.turnStartTime;
  return elapsed >= TURN_DURATION;
}

export function processTurnEnd(gameState: GameState): GameState {
  // Process powerup durations
  const updatedPlayers = gameState.players.map(player => ({
    ...player,
    cells: player.cells.map(cell => ({
      ...cell,
      frozen: false, // Reset frozen state
      powerups: cell.powerups.filter(p => p.duration > 1).map(p => ({
        ...p,
        duration: p.duration - 1
      }))
    })),
    powerups: player.powerups.filter(p => p.duration > 1).map(p => ({
      ...p,
      duration: p.duration - 1
    }))
  }));

  // Find next valid player
  let nextPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
  while (
    updatedPlayers[nextPlayer].eliminated ||
    updatedPlayers[nextPlayer].powerups.some(p => p.type === 'noRoll')
  ) {
    nextPlayer = (nextPlayer + 1) % gameState.players.length;
  }

  return {
    ...gameState,
    players: updatedPlayers,
    currentPlayer: nextPlayer,
    turnStartTime: Date.now()
  };
}