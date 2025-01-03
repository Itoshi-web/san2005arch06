export const POWERUP_COOLDOWN = 2; // turns

export function canUsePowerup(player, currentTurn) {
  return currentTurn - player.lastPowerupUsed >= POWERUP_COOLDOWN;
}

export function applyPowerup(targetPlayer, targetCell, powerupType) {
  const updatedPlayer = { ...targetPlayer };
  
  switch (powerupType) {
    case 'freeze':
      if (updatedPlayer.cells[targetCell]) {
        updatedPlayer.cells[targetCell].frozen = true;
      }
      break;
    case 'shield':
      if (updatedPlayer.cells[targetCell]) {
        updatedPlayer.cells[targetCell].powerups.push({
          type: 'shield',
          duration: 1
        });
      }
      break;
    case 'noRoll':
      updatedPlayer.powerups.push({
        type: 'noRoll',
        duration: 1
      });
      break;
  }
  
  return updatedPlayer;
}
