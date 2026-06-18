import React, { useState, useEffect, useCallback } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Gamepad2, Grid3X3, Swords, Trophy, Sparkles } from "lucide-react";
import TicTacToe from "./TicTacToe";
import Chess from "./Chess";
import Ludo from "./Ludo";

export type GameId = "tictactoe" | "chess" | "ludo";

export interface GameState {
  activeGameId: GameId | null;
  players: Record<string, string>; // Maps role (e.g. "X", "O", "white", "black") to peerId
  tictactoe: {
    board: (string | null)[];
    xTurn: boolean;
    scoreX: number;
    scoreO: number;
  };
  chess: {
    board: (string | null)[][]; // 8x8 grid of piece names (e.g. "wP", "bR")
    turn: "w" | "b";
    history: string[];
  };
  ludo: {
    positions: Record<string, number>; // token identifier -> path index
    turn: "red" | "green" | "yellow" | "blue";
    diceValue: number;
    hasRolled: boolean;
  };
}

const DEFAULT_STATE: GameState = {
  activeGameId: null,
  players: {},
  tictactoe: {
    board: Array(9).fill(null),
    xTurn: true,
    scoreX: 0,
    scoreO: 0,
  },
  chess: {
    board: [
      ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
      ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
      ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
    ],
    turn: "w",
    history: [],
  },
  ludo: {
    positions: {
      "red-0": -1, "red-1": -1, "red-2": -1, "red-3": -1,
      "green-0": -1, "green-1": -1, "green-2": -1, "green-3": -1,
    },
    turn: "red",
    diceValue: 1,
    hasRolled: false,
  },
};

export default function GamesModule(props: ModuleProps) {
  const { selfId, onModuleEvent } = props;
  const { getModuleState, setModuleState, syncModuleState } = useWebRTC();
  const [state, setState] = useState<GameState>(DEFAULT_STATE);

  // Sync state on mount
  useEffect(() => {
    const cached = getModuleState("games");
    if (cached) {
      setState(cached);
    }
    syncModuleState("games");
  }, [getModuleState, syncModuleState]);

  // Handle incoming remote state syncs
  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "games") return;
      if (env.event === "state:sync" || env.event === "update") {
        setState(env.payload as GameState);
      }
    });
  }, [onModuleEvent]);

  const updateGameState = useCallback((nextState: GameState) => {
    setState(nextState);
    setModuleState("games", nextState);
  }, [setModuleState]);

  const selectGame = (gameId: GameId | null) => {
    const next: GameState = {
      ...state,
      activeGameId: gameId,
      players: {}, // reset player roles on game switch
    };
    updateGameState(next);
  };

  const joinRole = (role: string) => {
    const next: GameState = {
      ...state,
      players: {
        ...state.players,
        [role]: selfId,
      },
    };
    updateGameState(next);
  };

  const leaveRole = (role: string) => {
    const updatedPlayers = { ...state.players };
    delete updatedPlayers[role];
    const next: GameState = {
      ...state,
      players: updatedPlayers,
    };
    updateGameState(next);
  };

  const resetGame = (gameId: GameId) => {
    const next: GameState = {
      ...state,
      players: {},
      [gameId]: DEFAULT_STATE[gameId],
    };
    updateGameState(next);
  };

  if (state.activeGameId === "tictactoe") {
    return (
      <div className="flex flex-col h-full bg-[#0d0f14] animate-fade-in">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-surface/30">
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl hover:bg-surface" onClick={() => selectGame(null)}>
            ← Games Lobby
          </button>
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Grid3X3 size={15} className="text-accent" /> Tic-Tac-Toe
          </span>
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl ml-auto border-danger/30 text-danger hover:bg-danger/10" onClick={() => resetGame("tictactoe")}>
            Reset Game
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <TicTacToe
            {...props}
            gameState={state}
            updateGameState={updateGameState}
            joinRole={joinRole}
            leaveRole={leaveRole}
          />
        </div>
      </div>
    );
  }

  if (state.activeGameId === "chess") {
    return (
      <div className="flex flex-col h-full bg-[#0d0f14] animate-fade-in">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-surface/30">
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl hover:bg-surface" onClick={() => selectGame(null)}>
            ← Games Lobby
          </button>
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Swords size={15} className="text-warn" /> Chess Arena
          </span>
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl ml-auto border-danger/30 text-danger hover:bg-danger/10" onClick={() => resetGame("chess")}>
            Reset Board
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Chess
            {...props}
            gameState={state}
            updateGameState={updateGameState}
            joinRole={joinRole}
            leaveRole={leaveRole}
          />
        </div>
      </div>
    );
  }

  if (state.activeGameId === "ludo") {
    return (
      <div className="flex flex-col h-full bg-[#0d0f14] animate-fade-in">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-surface/30">
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl hover:bg-surface" onClick={() => selectGame(null)}>
            ← Games Lobby
          </button>
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Trophy size={15} className="text-success" /> Ludo Race
          </span>
          <button className="btn-ghost text-xs py-1.5 px-3 rounded-xl ml-auto border-danger/30 text-danger hover:bg-danger/10" onClick={() => resetGame("ludo")}>
            Reset Board
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Ludo
            {...props}
            gameState={state}
            updateGameState={updateGameState}
            joinRole={joinRole}
            leaveRole={leaveRole}
          />
        </div>
      </div>
    );
  }

  const list = [
    { 
      id: "tictactoe" as GameId, 
      label: "Tic-Tac-Toe", 
      desc: "Glowing vector marks with live scoreboard & real-time spectator indicators.", 
      icon: <Grid3X3 size={24} className="text-accent" />,
      badge: "Fast Match"
    },
    { 
      id: "chess" as GameId, 
      label: "Chess Arena", 
      desc: "Polished ceramic board, dynamic vector pieces, and last-move highlights.", 
      icon: <Swords size={24} className="text-warn" />,
      badge: "Strategy"
    },
    { 
      id: "ludo" as GameId, 
      label: "Ludo Race", 
      desc: "2-Player circular race track with animated 3D roll physics and token slides.", 
      icon: <Trophy size={24} className="text-success" />,
      badge: "Classic Board"
    },
  ];

  return (
    <div className="flex flex-col h-full p-6 gap-6 max-h-screen overflow-y-auto bg-bg animate-fade-in">
      <div className="flex items-center gap-3 border-b border-border/20 pb-4">
        <div className="p-2 bg-accent/10 border border-accent/25 rounded-2xl text-accent">
          <Gamepad2 size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">Board Games Room</h2>
          <p className="text-xs text-muted mt-0.5">Select a game to play live with other room members.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <button
            key={g.id}
            onClick={() => selectGame(g.id)}
            className="glass rounded-3xl p-6 text-left hover:border-accent/40 transition-all duration-300 group hover:scale-[1.02] flex flex-col justify-between h-48 relative overflow-hidden shadow-md"
          >
            {/* Background Glow on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/0 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="flex items-start justify-between relative z-10 w-full">
              <div className="p-3 bg-surface border border-border/40 rounded-2xl group-hover:bg-accent/10 group-hover:border-accent/20 transition-all duration-300 shadow-sm">
                {g.icon}
              </div>
              <span className="text-[10px] bg-white/5 border border-white/10 text-muted font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider group-hover:border-accent/20 group-hover:text-accent transition-colors">
                {g.badge}
              </span>
            </div>

            <div className="relative z-10 mt-4">
              <div className="font-bold text-white group-hover:text-accent transition-colors text-base flex items-center gap-1.5">
                {g.label}
                <Sparkles size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-accent" />
              </div>
              <div className="text-xs text-muted/95 mt-1.5 leading-relaxed font-medium">{g.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto pt-6 border-t border-border/20 flex items-center gap-2 select-none">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
        <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
          Direct P2P Syncing via WebRTC DataChannels
        </p>
      </div>
    </div>
  );
}
