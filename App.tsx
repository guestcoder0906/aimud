import React, { useState, useEffect, useRef } from 'react';
import { AIEngine } from './services/aiEngine';
import { FileSystem } from './services/fileSystem';
import { NarrativeEntry, UpdateItem } from './types';
import Sidebar from './components/Sidebar';
import NarrativeWindow from './components/NarrativeWindow';
import InputArea from './components/InputArea';
import Modal from './components/Modal';
import MainMenu from './components/MainMenu';
import { MultiplayerService } from './services/multiplayer';

// Instantiate services outside component to persist across re-renders
const fileSystem = new FileSystem();
const aiEngine = new AIEngine(fileSystem);

function App() {
  const [narrative, setNarrative] = useState<NarrativeEntry[]>(() => {
    const saved = localStorage.getItem('aimud_narrative');
    return saved ? JSON.parse(saved) : [];
  });
  const [files, setFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>(() => {
    const saved = localStorage.getItem('aimud_updates');
    return saved ? JSON.parse(saved) : [];
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [worldTime, setWorldTime] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>(() => {
    const saved = localStorage.getItem('aimud_recommendations');
    return saved ? JSON.parse(saved) : [];
  });
  const [autoRecommendationsEnabled, setAutoRecommendationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('aimud_autoRecommendationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // Multiplayer state
  const [gameMode, setGameMode] = useState<'menu' | 'singleplayer' | 'multiplayer'>(() => {
    return (localStorage.getItem('aimud_gameMode') as any) || 'menu';
  });
  const [multiplayerService, setMultiplayerService] = useState<MultiplayerService | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('aimud_username') || '';
  });
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const [characterDescription, setCharacterDescription] = useState('');

  // Persist narrative and updates
  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_narrative', JSON.stringify(narrative));
    }
  }, [narrative, gameMode]);

  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_updates', JSON.stringify(updates));
    }
  }, [updates, gameMode]);

  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_recommendations', JSON.stringify(recommendations));
    }
  }, [recommendations, gameMode]);

  useEffect(() => {
    localStorage.setItem('aimud_autoRecommendationsEnabled', JSON.stringify(autoRecommendationsEnabled));
  }, [autoRecommendationsEnabled]);

  // Sync state with filesystem on mount and updates
  const syncFiles = () => {
    setFiles(fileSystem.list());
    const timeContent = fileSystem.read('WorldTime.txt');
    if (timeContent) {
      setWorldTime(timeContent);
    } else {
      setWorldTime('');
    }
  };

  const initMultiplayerService = () => {
    const ms = new MultiplayerService(
      fileSystem,
      (state) => {
        setRoomState(state);
        setNarrative(state.narrative || []);
        setUpdates(state.updates || []);
        setWorldTime(state.worldTime || '');
        syncFiles();
        
        // Check if we need to show character creation
        const me = state.players.find((p: any) => p.username === localStorage.getItem('aimud_username'));
        const myCharacterFileExists = fileSystem.list().some(f => f.endsWith(`-${me?.username}.txt`));
        if (state.gameState !== 'waiting_for_world' && me && !myCharacterFileExists) {
          setShowCharacterCreation(true);
        } else {
          setShowCharacterCreation(false);
        }
      },
      async (inputs) => {
        // Host executes turn
        setIsProcessing(true);
        const combinedInput = Object.entries(inputs)
          .map(([user, action]) => `${user} does: ${action}`)
          .join('\n');
        
        const result = await aiEngine.processAction(combinedInput);
        if (result) {
          const newNarrative = [...(roomState?.narrative || []), { id: Date.now().toString() + 'ai', text: result.narrative, type: 'ai' }];
          const safeUpdates = Array.isArray(result.updates) ? result.updates : [];
          const newUpdates = [...safeUpdates, ...(roomState?.updates || [])].slice(0, 50);
          
          ms.syncState({
            fileSystemState: fileSystem.exportState(),
            narrative: newNarrative,
            updates: newUpdates,
            gameState: 'playing',
            worldTime: fileSystem.read('WorldTime.txt') || '',
            turnProcessed: true
          });
        }
        setIsProcessing(false);
      },
      async ({ username: newUsername, description }) => {
        // Host creates character for new player
        setIsProcessing(true);
        const prompt = `Create a highly detailed and extensive character file for player "${newUsername}" based on this description: ${description}. The file MUST be named in the format "CharacterName-${newUsername}.txt" (e.g., if their character is named Bob, the file is "Bob-${newUsername}.txt"). Make sure to include exhaustive stats, deep psychological profile, a complete inventory, and explicit physical details including size, dimensions, and weight. Do NOT use dice notation (e.g., 1d6) for any stats or damage; use base values that will be modified by the probability engine. Stats must NOT be stale numbers (e.g., "Agility: 25"). Stats must be represented as modifiers to the base probability engine (0-1000) and include dynamic context and effects (e.g., "agility: base probability engine + 5%(1000) + effects"). Armor must be represented with a base threshold and specific damage type immunities below that threshold.`;
        await aiEngine.processAction(prompt);
        ms.characterCreated(newUsername);
        ms.syncState({
          fileSystemState: fileSystem.exportState(),
          narrative: roomState?.narrative || [],
          updates: roomState?.updates || [],
          gameState: 'playing',
          worldTime: fileSystem.read('WorldTime.txt') || ''
        });
        setIsProcessing(false);
      },
      () => {
        // Kicked
        alert('You have been kicked from the session.');
        setGameMode('menu');
        setMultiplayerService(null);
      },
      () => {
        // Adventure deleted
        alert('The host has deleted the adventure.');
        setGameMode('menu');
        setMultiplayerService(null);
      }
    );
    setMultiplayerService(ms);
    return ms;
  };

  const handleJoinGame = async (roomId: string, joinUsername: string) => {
    setUsername(joinUsername);
    localStorage.setItem('aimud_username', joinUsername);
    const ms = initMultiplayerService();
    try {
      await ms.joinRoom(roomId, joinUsername);
      localStorage.setItem('aimud_roomId', roomId);
      setGameMode('multiplayer');
    } catch (err: any) {
      alert(err);
      setGameMode('menu');
    }
  };

  useEffect(() => {
    localStorage.setItem('aimud_gameMode', gameMode);
    if (gameMode === 'singleplayer') {
      syncFiles();
      if (fileSystem.list().length === 0) {
         setNarrative([{
           id: 'init',
           text: 'Welcome to AI-SUD Gemini Edition. Enter a scenario prompt to begin (e.g., "A cyberpunk detective in Neo-Tokyo")',
           type: 'system'
         }]);
      } else {
        setIsInitialized(true);
        setNarrative(prev => {
          if (prev.length > 0 && prev[prev.length - 1].id.startsWith('resume')) {
            return prev;
          }
          return [...prev, {
            id: 'resume-' + Date.now(),
            text: 'Session Resumed. Check logs for last state.',
            type: 'system'
          }];
        });
      }
    } else if (gameMode === 'multiplayer' && !multiplayerService) {
      // Try to restore multiplayer session
      const savedRoomId = localStorage.getItem('aimud_roomId');
      const savedUsername = localStorage.getItem('aimud_username');
      if (savedRoomId && savedUsername) {
        handleJoinGame(savedRoomId, savedUsername);
      } else {
        setGameMode('menu');
      }
    }
  }, [gameMode]);

  const handleStartSingleplayer = () => {
    setGameMode('singleplayer');
  };

  const handleHostGame = async (hostUsername: string) => {
    setUsername(hostUsername);
    localStorage.setItem('aimud_username', hostUsername);
    const ms = initMultiplayerService();
    fileSystem.clear();
    const roomId = await ms.createRoom(hostUsername);
    localStorage.setItem('aimud_roomId', roomId);
    setGameMode('multiplayer');
    setNarrative([{
      id: 'init',
      text: `Hosting Room: ${roomId}. Enter a scenario prompt to begin world generation.`,
      type: 'system'
    }]);
  };

  const handleLeaveGame = () => {
    if (multiplayerService) {
      multiplayerService.leaveRoom();
      setMultiplayerService(null);
    }
    localStorage.removeItem('aimud_roomId');
    setGameMode('menu');
  };

  const handleAction = async (text: string) => {
    if (gameMode === 'singleplayer') {
      setIsProcessing(true);
      const userActionId = Date.now().toString();
      setNarrative(prev => [...prev, { id: userActionId, text: text, type: 'user' }]);

      let result;
      if (!isInitialized) {
         result = await aiEngine.initialize(text);
         setIsInitialized(true);
      } else {
         result = await aiEngine.processAction(text);
      }

      if (result) {
        if (result.narrative) {
          setNarrative(prev => [...prev, { id: Date.now().toString() + 'ai', text: result.narrative, type: 'ai' }]);
        }
        if (result.updates && Array.isArray(result.updates)) {
          setUpdates(prev => [...result.updates, ...prev].slice(0, 50));
        }
        if (result.recommendations && Array.isArray(result.recommendations)) {
          setRecommendations(result.recommendations);
        } else {
          setRecommendations([]);
        }
        if (result.gameOver && gameMode === 'singleplayer') {
          setGameOver(true);
          setNarrative(prev => [...prev, { id: 'death', text: 'CRITICAL FAILURE: Vital signs zero. Simulation Terminated.', type: 'system' }]);
        }
        syncFiles();
      }
      setIsProcessing(false);
    } else if (gameMode === 'multiplayer' && multiplayerService) {
      if (roomState?.gameState === 'waiting_for_world' && roomState?.hostUsername === username) {
        // Host initializing world
        setIsProcessing(true);
        const userActionId = Date.now().toString();
        const newNarrative = [...narrative, { id: userActionId, text: text, type: 'user' }];
        setNarrative(newNarrative);
        
        const result = await aiEngine.initialize(text);
        if (result) {
          const finalNarrative = [...newNarrative, { id: Date.now().toString() + 'ai', text: result.narrative || '', type: 'ai' }];
          if (result.recommendations && Array.isArray(result.recommendations)) {
            setRecommendations(result.recommendations);
          } else {
            setRecommendations([]);
          }
          const safeUpdates = Array.isArray(result.updates) ? result.updates : [];
          multiplayerService.syncState({
            fileSystemState: fileSystem.exportState(),
            narrative: finalNarrative,
            updates: safeUpdates,
            gameState: 'character_creation',
            worldTime: fileSystem.read('WorldTime.txt') || ''
          });
        }
        setIsProcessing(false);
      } else {
        // Normal action submission
        multiplayerService.submitAction(text);
        setNarrative(prev => [...prev, { id: Date.now().toString(), text: `[Action Submitted: ${text}] Waiting for others...`, type: 'system' }]);
      }
    }
  };

  const handleReferenceClick = (ref: string) => {
    const filename = fileSystem.findFileByReference(ref);
    if (filename) {
      setExpandedFile(filename);
    }
  };

  const handleReset = () => {
    if (gameMode === 'multiplayer' && multiplayerService) {
      multiplayerService.deleteAdventure();
    } else {
      fileSystem.clear();
      setNarrative([{
        id: 'reset',
        text: 'System Reset Complete. Enter a new scenario.',
        type: 'system'
      }]);
      setUpdates([]);
      setRecommendations([]);
      setGameOver(false);
      setIsInitialized(false);
      setExpandedFile(null);
      syncFiles();
      localStorage.removeItem('aimud_narrative');
      localStorage.removeItem('aimud_updates');
      localStorage.removeItem('aimud_recommendations');
    }
    setIsResetModalOpen(false);
  };

  const isHost = roomState?.hostUsername === username;
  const isMyTurnReady = roomState?.players?.find((p: any) => p.username === username)?.isReady;

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-black text-gray-200 overflow-hidden">
      {gameMode === 'menu' && (
        <MainMenu 
          onStartSingleplayer={handleStartSingleplayer}
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
        />
      )}

      {showCharacterCreation && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-8 rounded-lg shadow-2xl w-96 max-w-full">
            <h2 className="text-xl text-center text-blue-300 mb-4">Create Your Character</h2>
            <p className="text-sm text-gray-400 mb-4">Describe your character's class, appearance, and background.</p>
            <textarea 
              value={characterDescription}
              onChange={(e) => setCharacterDescription(e.target.value)}
              className="w-full h-32 bg-black border border-neutral-700 p-2 text-white font-mono mb-4"
              placeholder="e.g., A rogue elf with a mysterious past..."
            />
            <button 
              onClick={() => {
                multiplayerService?.createCharacter(characterDescription);
                setShowCharacterCreation(false);
              }}
              disabled={!characterDescription}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2 rounded font-mono"
            >
              Submit Character
            </button>
          </div>
        </div>
      )}

      <Sidebar 
        files={files}
        fileSystem={fileSystem}
        updates={updates}
        debugMode={debugMode}
        onToggleDebug={() => setDebugMode(!debugMode)}
        onReset={() => setIsResetModalOpen(true)}
        expandedFile={expandedFile}
        setExpandedFile={setExpandedFile}
        gameMode={gameMode}
        roomState={roomState}
        username={username}
        onKickPlayer={(user) => {
          if (multiplayerService) {
            const charFile = fileSystem.list().find(f => f.endsWith(`-${user}.txt`));
            if (charFile) fileSystem.delete(charFile);
            multiplayerService.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: roomState?.narrative || [],
              updates: roomState?.updates || [],
              gameState: roomState?.gameState || 'playing',
              worldTime: fileSystem.read('WorldTime.txt') || ''
            });
            multiplayerService.kickPlayer(user);
          }
        }}
        onLeaveGame={handleLeaveGame}
        onForceTurn={() => multiplayerService?.forceTurn()}
        onReferenceClick={handleReferenceClick}
        autoRecommendationsEnabled={autoRecommendationsEnabled}
        onToggleAutoRecommendations={() => setAutoRecommendationsEnabled(!autoRecommendationsEnabled)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <div className="bg-neutral-900 border-b border-neutral-800 p-2 text-center text-xs text-blue-400 font-mono tracking-widest shadow-lg z-10 flex justify-between items-center">
           <span>{worldTime || "TIME: UNKNOWN"}</span>
           {gameMode === 'multiplayer' && roomState && (
             <span className="text-emerald-400">Room: {roomState.id} | {roomState.players?.filter((p:any) => p.status === 'active').length} Players</span>
           )}
        </div>

        <NarrativeWindow 
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
          username={username}
        />

        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/20 backdrop-blur-sm z-20 pointer-events-none">
             <div className="bg-black border-2 border-red-600 p-8 rounded text-center shadow-[0_0_50px_rgba(220,38,38,0.5)]">
               <h1 className="text-4xl font-bold text-red-600 mb-2">TERMINATED</h1>
               <p className="text-gray-400">Please reset the system to restart.</p>
             </div>
          </div>
        )}

        <InputArea 
          onSend={handleAction} 
          disabled={isProcessing || gameOver || isMyTurnReady || (gameMode === 'multiplayer' && roomState?.gameState === 'waiting_for_world' && !isHost)} 
          recommendations={autoRecommendationsEnabled ? recommendations : []}
        />
      </div>

      <Modal 
        isOpen={isResetModalOpen}
        onConfirm={handleReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
}

export default App;