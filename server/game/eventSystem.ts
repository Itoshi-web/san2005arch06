import { GameEvent } from '../types/game';

export const EVENT_PROBABILITIES = {
  fastGrowth: 0.15,    // 15% chance
  drought: 0.1,        // 10% chance
  consecutiveRoll: 0.2 // 20% chance
};

export function processConsecutiveRolls(
  currentRoll: number,
  lastRoll: number,
  cellStage: number
): number {
  if (currentRoll === lastRoll && cellStage < 6) {
    return cellStage + 1; // Bonus growth
  }
  return cellStage;
}

export function checkForRandomEvent(): GameEvent | null {
  const roll = Math.random();
  
  if (roll < EVENT_PROBABILITIES.drought) return 'drought';
  if (roll < EVENT_PROBABILITIES.fastGrowth + EVENT_PROBABILITIES.drought) return 'fastGrowth';
  
  return null;
}
