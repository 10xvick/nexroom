import React, { useState, useEffect, useCallback } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Gamepad2, Grid3X3, Swords, Trophy } from "lucide-react";
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
    board: (string | null)[][]; // 8x8 grid of piece names (e.g. "wP", "bR") or FEN
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
      <div className="flex flex-col h-full bg-bg">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface/20">
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg" onClick={() => selectGame(null)}>
            ← Games
          </button>
          <span className="text-sm font-semibold text-white">Tic-Tac-Toe</span>
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg ml-auto" onClick={() => resetGame("tictactoe")}>
            Reset Game
          </button>
        </div>
        <div className="flex-1 overflow-auto">
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
      <div className="flex flex-col h-full bg-bg">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface/20">
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg" onClick={() => selectGame(null)}>
            ← Games
          </button>
          <span className="text-sm font-semibold text-white">Chess Board</span>
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg ml-auto" onClick={() => resetGame("chess")}>
            Reset Board
          </button>
        </div>
        <div className="flex-1 overflow-auto">
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
      <div className="flex flex-col h-full bg-bg">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface/20">
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg" onClick={() => selectGame(null)}>
            ← Games
          </button>
          <span className="text-sm font-semibold text-white">Ludo Board</span>
          <button className="btn-ghost text-xs py-1 px-2.5 rounded-lg ml-auto" onClick={() => resetGame("ludo")}>
            Reset Board
          </button>
        </div>
        <div className="flex-1 overflow-auto">
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
    { id: "tictactoe" as GameId, label: "Tic-Tac-Toe", desc: "Redesigned 3×3 grid with spectators and scoreboard.", icon: <Grid3X3 size={24} className="text-accent" /> },
    { id: "chess" as GameId, label: "Chess Board", desc: "Collaborative board to place pieces and play moves.", icon: <Swords size={24} className="text-warn" /> },
    { id: "ludo" as GameId, label: "Ludo Board", desc: "2-Player custom Ludo race board with roll physics.", icon: <Trophy size={24} className="text-success" /> },
  ];

  return (
    <div className="flex flex-col h-full p-6 gap-6 max-h-screen overflow-y-auto">
      <div className="flex items-center gap-2.5">
        <Gamepad2 size={24} className="text-accent" />
        <h2 className="text-xl font-bold text-white">Board Games Room</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <button
            key={g.id}
            onClick={() => selectGame(g.id)}
            className="glass rounded-xl p-5 text-left hover:border-accent/40 transition-all group hover:scale-[1.02]"
          >
            <div className="mb-3 p-2 bg-surface rounded-lg w-fit group-hover:bg-accent/10 transition-colors">
              {g.icon}
            </div>
            <div className="font-semibold text-white group-hover:text-accent transition-colors text-base">{g.label}</div>
            <div className="text-xs text-muted mt-1.5 leading-relaxed">{g.desc}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-auto opacity-70">
        All games run completely serverless, syncing role data and moves instantly over P2P DataChannels.
      </p>
    </div>
  );
}
