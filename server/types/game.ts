export interface Powerup {
  type: 'freeze' | 'shield' | 'noRoll';
  duration: number;
}

export interface GamePlayer {
  id: string;
  username: string;
  eliminated: boolean;
  firstMove: boolean;
  cells: Array<{
    stage: number;
    isActive: boolean;
    bullets: number;
    powerups: Powerup[];
    frozen: boolean;
  }>;
  powerups: Powerup[];
  lastPowerupUsed: number;
}

export interface GameState {
  currentPlayer: number;
  players: GamePlayer[];
  lastRoll: number | null;
  turnStartTime: number;
  currentTurn: number;
  gameLog: GameLogEntry[];
}

export type GameLogEntry = {
  type: 'firstMove' | 'activate' | 'maxLevel' | 'reload' | 'shoot' | 'eliminate' | 'powerup' | 'timeout';
  player: string;
  message?: string;
  cell?: number;
  shooter?: string;
  target?: string;
  powerupType?: string;
}