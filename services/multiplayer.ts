/// <reference types="vite/client" />
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { FileSystem } from './fileSystem';

export class MultiplayerService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private currentUsername: string | null = null;
  private syncQueue: Promise<any> = Promise.resolve();

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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase credentials in Vite env");
    }
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);

    this.fileSystem = fileSystem;
    this.onStateUpdate = onStateUpdate;
    this.onExecuteTurn = onExecuteTurn;
    this.onHostCreateCharacter = onHostCreateCharacter;
    this.onKicked = onKicked;
    this.onAdventureDeleted = onAdventureDeleted;
  }

  private generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(username: string): Promise<string> {
    const roomId = this.generateRoomCode();
    this.roomId = roomId;
    this.currentUsername = username;

    const initialState = {
      id: roomId,
      hostUsername: username,
      players: [{ username, status: 'active', isReady: false, hasCharacter: false }],
      gameState: 'waiting_for_world',
      fileSystemState: { files: {}, metadata: {} },
      narrative: [],
      updates: [],
      pendingInputs: {},
      worldTime: ''
    };

    const { error } = await this.supabase
      .from('rooms')
      .insert({ id: roomId, host_username: username, state: initialState });

    if (error) {
      console.error("Failed to create room in DB", error);
      throw new Error("Unable to contact database");
    }

    await this.setupChannel(roomId, username, true);
    // Emit initial
    this.onStateUpdate(initialState);
    return roomId;
  }

  async joinRoom(roomId: string, username: string): Promise<any> {
    const { data: room, error } = await this.supabase
      .from('rooms')
      .select('state')
      .eq('id', roomId)
      .single();

    if (error || !room) {
      throw new Error('Room not found');
    }

    const state = room.state;
    // We no longer update DB here. The client just sets up its channel and presence.
    // The Host's presence sync listener will detect the new user and add them securely to the DB.

    this.roomId = roomId;
    this.currentUsername = username;

    await this.setupChannel(roomId, username, false);

    this.fileSystem.importState(state.fileSystemState);
    return state;
  }

  private async setupChannel(roomId: string, username: string, isHost: boolean) {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
    }

    this.channel = this.supabase.channel(`room:${roomId}`, {
      config: {
        presence: { key: username }
      }
    });

    this.channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const newState = payload.new.state;

        // The host locally computes files via aiEngine, so importing from DB would overwrite concurrent local fs changes with older echos.
        if (this.currentUsername !== newState.hostUsername) {
          this.fileSystem.importState(newState.fileSystemState);
        }

        this.onStateUpdate(newState);
      })
      .on('broadcast', { event: 'submit_action' }, (payload: any) => {
        // Host intercepts actions and writes to DB
        if (this.currentUsername === payload.payload.host) {
          this.handlePlayerActionAsHost(payload.payload.username, payload.payload.action);
        }
      })
      .on('broadcast', { event: 'execute_turn' }, (payload: any) => {
        if (this.currentUsername === payload.payload.host) {
          this.onExecuteTurn(payload.payload.inputs);
        }
      })
      .on('broadcast', { event: 'create_character' }, (payload: any) => {
        if (this.currentUsername === payload.payload.host) {
          this.onHostCreateCharacter({ username: payload.payload.username, description: payload.payload.description });
        }
      })
      .on('broadcast', { event: 'kick_player' }, (payload: any) => {
        if (this.currentUsername === payload.payload.username) {
          this.leaveRoom();
          this.onKicked();
        }
      })
      .on('broadcast', { event: 'adventure_deleted' }, () => {
        this.leaveRoom();
        this.onAdventureDeleted();
      });

    // Handle Presence to mark players active/inactive automatically
    this.channel.on('presence', { event: 'sync' }, () => {
      const presenceState = this.channel?.presenceState() || {};
      const activeUsernames = Object.keys(presenceState);

      if (this.currentUsername) {
        // Enqueue host's presence reconciliation to prevent race conditions with syncState
        this.syncQueue = this.syncQueue.then(async () => {
          const { data } = await this.supabase.from('rooms').select('state, host_username').eq('id', roomId).single();
          if (data && data.host_username === this.currentUsername) {
            const state = data.state;
            let changed = false;

            // Mark existing as active/inactive
            state.players.forEach((p: any) => {
              const isActive = activeUsernames.some(u => u.toLowerCase() === p.username.toLowerCase());
              if (p.status !== (isActive ? 'active' : 'inactive')) {
                p.status = isActive ? 'active' : 'inactive';
                changed = true;
              }
            });

            // Add newly joined players
            activeUsernames.forEach((u: string) => {
              if (!state.players.find((p: any) => p.username.toLowerCase() === u.toLowerCase())) {
                state.players.push({ username: u, status: 'active', isReady: false, hasCharacter: false });
                changed = true;
              }
            });

            if (changed) {
              await this.supabase.from('rooms').update({ state }).eq('id', roomId);
              this.checkTurnForHost(state);
            }
          }
        });
      }
    });

    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel?.track({ user: username, online_at: new Date().toISOString() });
      }
    });
  }

  async leaveRoom() {
    if (this.channel) {
      await this.channel.untrack();
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomId = null;
    this.currentUsername = null;
  }

  async submitAction(action: string) {
    if (!this.roomId || !this.channel) return;

    // Fetch host dynamically from DB to avoid staleness
    const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
    if (data) {
      if (this.currentUsername === data.host_username) {
        this.handlePlayerActionAsHost(this.currentUsername, action);
      } else {
        this.channel.send({
          type: 'broadcast',
          event: 'submit_action',
          payload: { username: this.currentUsername, action, host: data.host_username }
        });
      }
    }
  }

  // Host only
  private async handlePlayerActionAsHost(username: string, action: string) {
    if (!this.roomId) return;
    this.syncQueue = this.syncQueue.then(async () => {
      const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
      if (data) {
        const state = data.state;
        state.pendingInputs[username] = action;
        const player = state.players.find((p: any) => p.username === username);
        if (player) player.isReady = true;

        await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        this.checkTurnForHost(state);
      }
    });
  }

  private checkTurnForHost(state: any) {
    // If we're waiting for characters, see if everyone active has one now
    if (state.gameState === 'character_creation') {
      const activePlayers = state.players.filter((p: any) => p.status === 'active');
      const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);

      if (allHaveCharacters) {
        state.gameState = 'playing';
        // Need to broadcast this state change down
        this.supabase.from('rooms').update({ state }).eq('id', this.roomId).then(() => {
          // State updated to playing seamlessly
        });
      }
      return;
    }

    if (state.gameState !== 'playing') return;
    const activePlayers = state.players.filter((p: any) => p.status === 'active' && p.hasCharacter);
    if (activePlayers.length > 0 && activePlayers.every((p: any) => p.isReady)) {
      // Execute turn directly on Host
      this.onExecuteTurn(state.pendingInputs);

      this.channel?.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: state.pendingInputs }
      });
    }
  }

  async createCharacter(description: string) {
    if (!this.roomId || !this.channel) return;
    const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
    if (data && this.currentUsername) {
      if (this.currentUsername === data.host_username) {
        this.onHostCreateCharacter({ username: this.currentUsername, description });
      } else {
        this.channel.send({
          type: 'broadcast',
          event: 'create_character',
          payload: { username: this.currentUsername, description, host: data.host_username }
        });
      }
    }
  }

  async syncState(partialState: any) {
    return new Promise<void>((resolve) => {
      this.syncQueue = this.syncQueue.then(async () => {
        if (!this.roomId) return resolve();

        const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
        if (!data) return resolve();

        const state = { ...data.state, ...partialState };

        // Update hasCharacter based on file existence
        if (state.players && state.fileSystemState?.files) {
          state.players.forEach((p: any) => {
            const uLower = p.username.toLowerCase();
            p.hasCharacter = Object.keys(state.fileSystemState.files).some(f => {
              const lowerF = f.toLowerCase();
              return lowerF.endsWith(`-${uLower}.txt`) ||
                lowerF.endsWith(`_${uLower}.txt`) ||
                lowerF.endsWith(` ${uLower}.txt`) ||
                lowerF.replace(/\.txt$/, '').trim().endsWith(uLower);
            });
          });
        }

        if (state.turnProcessed) {
          if (state.players) state.players.forEach((p: any) => p.isReady = false);
          state.pendingInputs = {};
          state.turnProcessed = false; // reset the flag
        }

        // Try to auto-start if ready
        if (state.gameState === 'character_creation' && state.players) {
          const activePlayers = state.players.filter((p: any) => p.status === 'active');
          const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);
          if (allHaveCharacters) {
            state.gameState = 'playing';
          }
        }

        await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        this.checkTurnForHost(state);
        resolve();
      });
    });
  }

  async forceTurn() {
    if (!this.roomId) return;
    const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
    if (data && this.channel) {
      // Execute directly on Host
      this.onExecuteTurn(data.state.pendingInputs);

      this.channel.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: data.state.pendingInputs }
      });
    }
  }

  kickPlayer(username: string) {
    this.channel?.send({
      type: 'broadcast',
      event: 'kick_player',
      payload: { username }
    });
  }

  async deleteAdventure() {
    if (!this.roomId) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'adventure_deleted'
    });
    await this.supabase.from('rooms').delete().eq('id', this.roomId);
    this.leaveRoom();
  }
}

