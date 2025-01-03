import { GamePlayer } from '../types/game';

export function checkDominantPlayer(players: GamePlayer[]): boolean {
  return players.some(player =>
    player.cells.filter(cell => cell.isActive).length >
    Math.ceil(players.length * 0.75)
  );
}

export function applySurvivalBoost(cell: any): any {
  return {
    ...cell,
    stage: Math.min(cell.stage + 2, 6),
    powerups: [
      ...cell.powerups,
      { type: 'shield', duration: 2 }
    ]
  };
}
