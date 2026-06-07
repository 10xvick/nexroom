import { useState } from "react";
import type { ModuleProps } from "../../core/types";
import TicTacToe from "./TicTacToe";
import DrawGuess from "./DrawGuess";
import { Gamepad2 } from "lucide-react";

type GameId = "tictactoe" | "drawguess";

const GAMES: { id: GameId; label: string; desc: string; emoji: string }[] = [
  { id: "tictactoe", label: "Tic-Tac-Toe", desc: "Classic 3×3 board, 2 players", emoji: "⭕" },
  { id: "drawguess", label: "Draw & Guess", desc: "One draws, others guess the word", emoji: "🎨" },
];

export default function GamesModule(props: ModuleProps) {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  if (activeGame === "tictactoe") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <button className="btn-ghost text-xs py-1" onClick={() => setActiveGame(null)}>← Back</button>
          <span className="text-sm font-medium">Tic-Tac-Toe</span>
        </div>
        <TicTacToe {...props} />
      </div>
    );
  }

  if (activeGame === "drawguess") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <button className="btn-ghost text-xs py-1" onClick={() => setActiveGame(null)}>← Back</button>
          <span className="text-sm font-medium">Draw & Guess</span>
        </div>
        <DrawGuess {...props} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center gap-2 mb-2">
        <Gamepad2 size={20} className="text-accent" />
        <h2 className="text-lg font-semibold">Games</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGame(g.id)}
            className="glass rounded-xl p-5 text-left hover:border-accent/50 transition-all group"
          >
            <div className="text-3xl mb-2">{g.emoji}</div>
            <div className="font-semibold text-white group-hover:text-accent transition-colors">{g.label}</div>
            <div className="text-sm text-muted mt-1">{g.desc}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-auto">More games coming soon — modules are pluggable!</p>
    </div>
  );
}
