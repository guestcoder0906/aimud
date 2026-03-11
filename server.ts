import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';

interface Player {
  username: string;
  socketId: string;
  status: 'active' | 'inactive';
  isReady: boolean;
  hasCharacter: boolean;
}

interface Room {
  id: string;
  hostUsername: string;
  players: Player[];
  gameState: 'waiting_for_world' | 'character_creation' | 'playing';
  fileSystemState: any;
  narrative: any[];
  updates: any[];
  pendingInputs: Record<string, string>;
  worldTime: string;
}

const app = express();
const PORT = 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const rooms = new Map<string, Room>();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  let currentRoomId: string | null = null;
  let currentUsername: string | null = null;

  socket.on('create_room', (username: string) => {
    const roomId = generateRoomCode();
    rooms.set(roomId, {
      id: roomId,
      hostUsername: username,
      players: [{ username, socketId: socket.id, status: 'active', isReady: false, hasCharacter: false }],
      gameState: 'waiting_for_world',
      fileSystemState: { files: {}, metadata: {} },
      narrative: [],
      updates: [],
      pendingInputs: {},
      worldTime: ''
    });
    currentRoomId = roomId;
    currentUsername = username;
    socket.join(roomId);
    socket.emit('room_created', roomId);
    socket.emit('state_updated', rooms.get(roomId));
  });

  socket.on('join_room', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    // Check if username exists
    const existingPlayerIndex = room.players.findIndex(p => p.username === username);
    if (existingPlayerIndex !== -1) {
      if (room.players[existingPlayerIndex].status === 'active') {
        socket.emit('error', 'Username already taken in this session');
        return;
      } else {
        // Reconnect
        room.players[existingPlayerIndex].socketId = socket.id;
        room.players[existingPlayerIndex].status = 'active';
      }
    } else {
      room.players.push({ username, socketId: socket.id, status: 'active', isReady: false, hasCharacter: false });
    }

    currentRoomId = roomId;
    currentUsername = username;
    socket.join(roomId);
    socket.emit('room_joined', room);
    io.to(roomId).emit('state_updated', room);
  });

  socket.on('leave_room', () => {
    if (currentRoomId && currentUsername) {
      const room = rooms.get(currentRoomId);
      if (room) {
        const player = room.players.find(p => p.username === currentUsername);
        if (player) {
          player.status = 'inactive';
          if (room.hostUsername === currentUsername) {
            // Assign new host to the oldest active player
            const newHost = room.players.find(p => p.status === 'active' && p.username !== currentUsername);
            if (newHost) {
              room.hostUsername = newHost.username;
            } else {
              // Optional: delete room if no active players
            }
          }
        }
        io.to(currentRoomId).emit('state_updated', room);
      }
      socket.leave(currentRoomId);
      currentRoomId = null;
      currentUsername = null;
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && currentUsername) {
      const room = rooms.get(currentRoomId);
      if (room) {
        const player = room.players.find(p => p.username === currentUsername);
        if (player) {
          player.status = 'inactive';
          if (room.hostUsername === currentUsername) {
            // Assign new host
            const newHost = room.players.find(p => p.status === 'active' && p.username !== currentUsername);
            if (newHost) {
              room.hostUsername = newHost.username;
            }
          }
        }
        io.to(currentRoomId).emit('state_updated', room);

        // Check if turn should proceed
        checkTurn(room);
      }
    }
  });

  socket.on('sync_state', (state) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostUsername === currentUsername) {
      room.fileSystemState = state.fileSystemState;
      room.narrative = state.narrative;
      room.updates = state.updates;
      room.gameState = state.gameState;
      room.worldTime = state.worldTime;

      // Update hasCharacter based on file existence
      room.players.forEach(p => {
        p.hasCharacter = Object.keys(room.fileSystemState.files).some(f => f.toLowerCase().endsWith(`-${p.username.toLowerCase()}.txt`));
      });

      // Reset ready states if we just processed a turn
      if (state.turnProcessed) {
        room.players.forEach(p => p.isReady = false);
        room.pendingInputs = {};
      }

      io.to(currentRoomId).emit('state_updated', room);

      // Check if turn should proceed (e.g., if a player died and is no longer active)
      checkTurn(room);
    }
  });

  socket.on('submit_action', (action) => {
    if (!currentRoomId || !currentUsername) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.pendingInputs[currentUsername] = action;
      const player = room.players.find(p => p.username === currentUsername);
      if (player) player.isReady = true;

      io.to(currentRoomId).emit('state_updated', room);
      checkTurn(room);
    }
  });

  socket.on('create_character', (description) => {
    if (!currentRoomId || !currentUsername) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      const hostPlayer = room.players.find(p => p.username === room.hostUsername);
      if (hostPlayer) {
        io.to(hostPlayer.socketId).emit('host_create_character', { username: currentUsername, description });
      }
    }
  });

  socket.on('character_created', (username) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostUsername === currentUsername) {
      const player = room.players.find(p => p.username === username);
      if (player) {
        player.hasCharacter = true;
        io.to(currentRoomId).emit('state_updated', room);
      }
    }
  });

  socket.on('force_turn', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostUsername === currentUsername) {
      executeTurn(room);
    }
  });

  socket.on('kick_player', (username) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostUsername === currentUsername) {
      const player = room.players.find(p => p.username === username);
      if (player) {
        player.status = 'inactive';
        io.to(currentRoomId).emit('player_kicked', username);
        io.to(currentRoomId).emit('state_updated', room);
      }
    }
  });

  socket.on('delete_adventure', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostUsername === currentUsername) {
      io.to(currentRoomId).emit('adventure_deleted');
      rooms.delete(currentRoomId);
    }
  });

  function checkTurn(room: Room) {
    if (room.gameState !== 'playing') return;
    const activePlayers = room.players.filter(p => p.status === 'active' && p.hasCharacter);
    if (activePlayers.length > 0 && activePlayers.every(p => p.isReady)) {
      executeTurn(room);
    }
  }

  function executeTurn(room: Room) {
    const hostPlayer = room.players.find(p => p.username === room.hostUsername);
    if (hostPlayer) {
      io.to(hostPlayer.socketId).emit('execute_turn', room.pendingInputs);
    }
  }
});

async function startVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startVite();
