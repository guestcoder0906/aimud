import React, { useState, useEffect } from 'react';

interface MainMenuProps {
  onStartSingleplayer: () => void;
  onHostGame: (username: string) => void;
  onJoinGame: (roomId: string, username: string) => void;
}

export default function MainMenu({ onStartSingleplayer, onHostGame, onJoinGame }: MainMenuProps) {
  const [mode, setMode] = useState<'menu' | 'host' | 'join'>('menu');
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const savedApiKey = localStorage.getItem('aimud_apikey');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    const savedUsername = localStorage.getItem('aimud_username');
    if (savedUsername) {
      setUsername(savedUsername);
    } else {
      setUsername('Player' + Math.floor(Math.random() * 10000));
    }
  }, []);

  const handleHost = () => {
    localStorage.setItem('aimud_username', username);
    onHostGame(username);
  };

  const handleJoin = () => {
    localStorage.setItem('aimud_username', username);
    onJoinGame(roomId.toUpperCase(), username);
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('aimud_apikey', apiKey);
    // Reload page to re-initialize AI engine with new key
    window.location.reload();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-700 p-8 rounded-lg shadow-2xl w-[450px] max-w-full my-8">
        <h1 className="text-3xl font-bold text-center text-blue-400 mb-6 font-mono tracking-widest">AI-SUD</h1>

        <div className="flex flex-col gap-2 mb-8 bg-black/50 p-4 border border-neutral-800 rounded">
          <label className="text-gray-400 text-sm font-mono">
            Gemini API Key {process.env.API_KEY ? '(Environment Key Detected)' : '(Required for Localhost)'}
          </label>
          <input
            type="password"
            placeholder={process.env.API_KEY ? "Using Environment Key..." : "AIzaSy..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="bg-black border border-neutral-700 p-2 text-white font-mono"
          />
          <button
            onClick={handleSaveApiKey}
            className="bg-neutral-800 hover:bg-neutral-700 text-xs text-center text-gray-300 p-2 rounded mt-1 font-mono transition-colors"
          >
            Override with New Key
          </button>
        </div>

        {mode === 'menu' && (
          <div className="flex flex-col gap-4">
            <button
              onClick={onStartSingleplayer}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-3 rounded font-mono transition-colors"
            >
              Singleplayer
            </button>
            <button
              onClick={() => setMode('host')}
              className="bg-blue-900/50 hover:bg-blue-800/50 text-blue-200 border border-blue-800 p-3 rounded font-mono transition-colors"
            >
              Host Multiplayer
            </button>
            <button
              onClick={() => setMode('join')}
              className="bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-200 border border-emerald-800 p-3 rounded font-mono transition-colors"
            >
              Join Multiplayer
            </button>
          </div>
        )}

        {mode === 'host' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl text-center text-blue-300 mb-2">Host Game</h2>
            <input
              type="text"
              placeholder="Display Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-black border border-neutral-700 p-2 text-white font-mono"
            />
            <button
              onClick={handleHost}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded font-mono mt-2"
            >
              Start Hosting
            </button>
            <button
              onClick={() => setMode('menu')}
              className="text-neutral-500 hover:text-white text-sm mt-2"
            >
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl text-center text-emerald-300 mb-2">Join Game</h2>
            <input
              type="text"
              placeholder="Display Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-black border border-neutral-700 p-2 text-white font-mono"
            />
            <input
              type="text"
              placeholder="Room Code"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="bg-black border border-neutral-700 p-2 text-white font-mono uppercase"
              maxLength={5}
            />
            <button
              onClick={handleJoin}
              disabled={!roomId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2 rounded font-mono mt-2"
            >
              Join
            </button>
            <button
              onClick={() => setMode('menu')}
              className="text-neutral-500 hover:text-white text-sm mt-2"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
