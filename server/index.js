import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import 'dotenv/config';
import { canUsePowerup, applyPowerup } from './game/powerups';
import { initializeTurn, checkTurnTimeout, processTurnEnd } from './game/turnManager';
import { processConsecutiveRolls } from './game/eventSystem';
import { checkDominantPlayer, applySurvivalBoost } from './game/balancing';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://singular-melba-6796d6.netlify.app']
      : ['http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();

const generateRoomId = () => {
  let roomId;
  do {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(roomId));
  return roomId;
};

const initializeGameState = (players) => ({
  currentPlayer: 0,
  players: players.map((p) => ({
    id: p.id,
    username: p.username,
    eliminated: false,
    firstMove: true,
    cells: Array(players.length).fill({ stage: 0, isActive: false, bullets: 0 }),
  })),
  lastRoll: null,
  gameLog: [],
  canShoot: false,
  rolledCell: null,
});

const processGameAction = (room, action, data) => {
  const { gameState } = room;
  const currentPlayer = gameState.players[gameState.currentPlayer];

  switch (action) {
    case 'roll': {
      const { value } = data;
      gameState.lastRoll = value;
      gameState.rolledCell = value - 1;

      if (currentPlayer.firstMove) {
        if (value !== 1) {
          gameState.gameLog.push({
            type: 'firstMove',
            player: currentPlayer.username,
            message: `${currentPlayer.username} didn't roll a 1. Next player's turn!`,
          });
          gameState.canShoot = false;
          advanceToNextPlayer(gameState);
          break;
        } else {
          currentPlayer.firstMove = false;
        }
      }

      const cellIndex = value - 1;
      const cell = currentPlayer.cells[cellIndex];

      if (cell.isActive && cell.stage === 6 && cell.bullets > 0) {
        gameState.canShoot = true;
        return gameState;
      }

      if (!cell.isActive) {
        currentPlayer.cells[cellIndex] = {
          stage: 1,
          isActive: true,
          bullets: 0,
        };
        gameState.gameLog.push({
          type: 'activate',
          player: currentPlayer.username,
          cell: cellIndex + 1,
        });
      } else if (cell.stage < 6) {
        cell.stage += 1;
        if (cell.stage === 6) {
          cell.bullets = 5;
          gameState.gameLog.push({
            type: 'maxLevel',
            player: currentPlayer.username,
            cell: cellIndex + 1,
          });
        }
      } else if (cell.bullets === 0) {
        cell.bullets = 5;
        gameState.gameLog.push({
          type: 'reload',
          player: currentPlayer.username,
          cell: cellIndex + 1,
        });
      }

      gameState.canShoot = false;
      advanceToNextPlayer(gameState);
      break;
    }

    case 'shoot': {
      const { targetPlayer, targetCell } = data;
      const sourceCell = currentPlayer.cells[gameState.rolledCell];
      const target = gameState.players[targetPlayer];

      if (sourceCell.bullets > 0) {
        target.cells[targetCell] = {
          stage: 0,
          isActive: false,
          bullets: 0,
        };

        sourceCell.bullets -= 1;

        gameState.gameLog.push({
          type: 'shoot',
          shooter: currentPlayer.username,
          target: target.username,
          cell: targetCell + 1,
        });

        target.eliminated = target.cells.every((cell) => !cell.isActive);
        if (target.eliminated) {
          gameState.gameLog.push({
            type: 'eliminate',
            player: target.username,
          });
        }
      }

      gameState.canShoot = false;
      advanceToNextPlayer(gameState);
      break;
    }

    case 'powerup': {
      const { targetPlayer, targetCell, powerupType } = data;
      const player = gameState.players[gameState.currentPlayer];

      if (canUsePowerup(player, gameState.currentTurn)) {
        const updatedPlayers = [...gameState.players];
        updatedPlayers[targetPlayer] = applyPowerup(
          updatedPlayers[targetPlayer],
          targetCell,
          powerupType,
        );

        gameState.players = updatedPlayers;
        gameState.gameLog.push({
          type: 'powerup',
          player: player.username,
          target: updatedPlayers[targetPlayer].username,
          powerupType,
        });

        player.lastPowerupUsed = gameState.currentTurn;
      }
      break;
    }
  }

  return gameState;
};

const advanceToNextPlayer = (gameState) => {
  do {
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
  } while (
    gameState.players[gameState.currentPlayer].eliminated &&
    gameState.players.some((p) => !p.eliminated)
  );
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', ({ maxPlayers, password, username }) => {
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      leader: socket.id,
      password: password || null,
      maxPlayers,
      players: [
        {
          id: socket.id,
          username,
          ready: true,
          isLeader: true,
        },
      ],
      gameState: null,
      started: false,
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('roomCreated', {
      roomId,
      room: {
        ...room,
        password: undefined,
      },
    });
  });

  socket.on('joinRoom', ({ roomId, password, username }) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.password && room.password !== password) {
      socket.emit('error', { message: 'Incorrect password' });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    if (room.started) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    room.players.push({
      id: socket.id,
      username,
      ready: false,
      isLeader: false,
    });

    socket.join(roomId);

    io.to(roomId).emit('playerJoined', {
      room: {
        ...room,
        password: undefined,
      },
    });
  });

  socket.on('toggleReady', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (player) {
      player.ready = !player.ready;
      io.to(roomId).emit('roomUpdated', {
        room: {
          ...room,
          password: undefined,
        },
      });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.leader !== socket.id) return;

    if (room.players.every((p) => p.ready)) {
      room.started = true;
      room.gameState = initializeGameState(room.players);
      io.to(roomId).emit('gameStarted', { gameState: room.gameState });
    }
  });

  socket.on('gameAction', ({ roomId, action, data }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;

    const currentPlayerId = room.gameState.players[room.gameState.currentPlayer].id;
    if (currentPlayerId !== socket.id) return;

    const updatedGameState = processGameAction(room, action, data);

    if (checkTurnTimeout(room.gameState)) {
      room.gameState = processTurnEnd(room.gameState);
      room.gameState.gameLog.push({
        type: 'timeout',
        player: room.gameState.players[room.gameState.currentPlayer].username,
      });
    }

    io.to(roomId).emit('gameStateUpdated', { gameState: updatedGameState });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          if (disconnectedPlayer.isLeader) {
            room.players[0].isLeader = true;
            room.leader = room.players[0].id;
          }

          io.to(roomId).emit('playerDisconnected', {
            room: { ...room, password: undefined },
            disconnectedPlayer: disconnectedPlayer.username,
          });

          if (room.started) {
            const targetIndex = room.gameState.players.findIndex((p) => p.id === socket.id);
            if (targetIndex !== -1) {
              room.gameState.players[targetIndex].eliminated = true;

              const remainingPlayers = room.gameState.players.filter((p) => !p.eliminated);
              if (remainingPlayers.length === 1) {
                io.to(roomId).emit('gameOver', { winner: remainingPlayers[0].username });
                room.started = false;
                room.gameState = null;
              } else {
                io.to(roomId).emit('gameStateUpdated', { gameState: room.gameState });
              }
            }
          }
        }
        break;
      }
    }
  });
});

httpServer.listen(3000, () => {
  console.log('Server running on port 3000');
});
