import { io, Socket } from 'socket.io-client';
import { FileSystem } from './fileSystem';
import { NarrativeEntry, UpdateItem } from '../types';

export class MultiplayerService {
  private socket: Socket;
  private fileSystem: FileSystem;
  private onStateUpdate: (state: any) => void;
  private onExecuteTurn: (inputs: Record<string, string>) => void;
  private onHostCreateCharacter: (data: { username: string, description: string }) => void;
  private onKicked: () => void;
  private onAdventureDeleted: () => void;

  constructor(
    fileSystem: FileSystem,
    onStateUpdate: (state: any) => void,
    onExecuteTurn: (inputs: Record<string, string>) => void,
    onHostCreateCharacter: (data: { username: string, description: string }) => void,
    onKicked: () => void,
    onAdventureDeleted: () => void
  ) {
    this.socket = io();
    this.fileSystem = fileSystem;
    this.onStateUpdate = onStateUpdate;
    this.onExecuteTurn = onExecuteTurn;
    this.onHostCreateCharacter = onHostCreateCharacter;
    this.onKicked = onKicked;
    this.onAdventureDeleted = onAdventureDeleted;

    this.socket.on('state_updated', (room) => {
      this.fileSystem.importState(room.fileSystemState);
      this.onStateUpdate(room);
    });

    this.socket.on('execute_turn', (inputs) => {
      this.onExecuteTurn(inputs);
    });

    this.socket.on('host_create_character', (data) => {
      this.onHostCreateCharacter(data);
    });

    this.socket.on('player_kicked', (username) => {
      if (username === localStorage.getItem('aimud_username')) {
        this.onKicked();
      }
    });

    this.socket.on('adventure_deleted', () => {
      this.onAdventureDeleted();
    });
  }

  createRoom(username: string) {
    return new Promise<string>((resolve) => {
      this.socket.emit('create_room', username);
      this.socket.once('room_created', (roomId) => resolve(roomId));
    });
  }

  joinRoom(roomId: string, username: string) {
    return new Promise<any>((resolve, reject) => {
      this.socket.emit('join_room', { roomId, username });
      this.socket.once('room_joined', (room) => resolve(room));
      this.socket.once('error', (err) => reject(err));
    });
  }

  leaveRoom() {
    this.socket.emit('leave_room');
  }

  submitAction(action: string) {
    this.socket.emit('submit_action', action);
  }

  createCharacter(description: string) {
    this.socket.emit('create_character', description);
  }

  characterCreated(username: string) {
    this.socket.emit('character_created', username);
  }

  syncState(state: any) {
    this.socket.emit('sync_state', state);
  }

  forceTurn() {
    this.socket.emit('force_turn');
  }

  kickPlayer(username: string) {
    this.socket.emit('kick_player', username);
  }

  deleteAdventure() {
    this.socket.emit('delete_adventure');
  }
}
