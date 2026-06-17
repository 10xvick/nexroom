import React, { useState } from "react";
import type { ModuleProps } from "../../core/types";
import type { GameState } from "./GamesModule";
import { User, ShieldAlert } from "lucide-react";

interface ChessProps extends ModuleProps {
  gameState: GameState;
  updateGameState: (nextState: GameState) => void;
  joinRole: (role: string) => void;
  leaveRole: (role: string) => void;
}

// Maps piece abbreviation to unicode character
const PIECES: Record<string, string> = {
  wP: "♙", wR: "♖", wN: "♘", wB: "♗", wQ: "♕", wK: "♔",
  bP: "♟", bR: "♜", bN: "♞", bB: "♝", bQ: "♛", bK: "♚"
};

export default function Chess({
  selfId,
  peers,
  gameState,
  updateGameState,
  joinRole,
  leaveRole
}: ChessProps) {
  const { board, turn, history } = gameState.chess;
  const playerWhite = gameState.players["white"];
  const playerBlack = gameState.players["black"];

  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  const peerList = Array.from(peers.values());
  const getPeerName = (id: string) => {
    if (id === selfId) return "You";
    return peers.get(id)?.peerName || id.slice(0, 8);
  };

  const myRole = playerWhite === selfId ? "w" : playerBlack === selfId ? "b" : null;
  const isMyTurn = myRole === turn;

  const handleCellClick = (row: number, col: number) => {
    if (!myRole) return; // Spectators cannot make moves

    const piece = board[row][col];

    // Select piece of own color
    if (piece && piece.startsWith(myRole)) {
      setSelectedCell([row, col]);
      return;
    }

    // Move selected piece
    if (selectedCell) {
      const [fromRow, fromCol] = selectedCell;
      const movingPiece = board[fromRow][fromCol];
      if (!movingPiece) return;

      if (fromRow === row && fromCol === col) {
        setSelectedCell(null); // deselect
        return;
      }

      // Perform move
      const nextBoard = board.map((r) => [...r]);
      nextBoard[row][col] = movingPiece;
      nextBoard[fromRow][fromCol] = null;

      // Add to history
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
      const moveStr = `${movingPiece.slice(1)}:${files[fromCol]}${ranks[fromRow]}→${files[col]}${ranks[row]}`;

      const nextState: GameState = {
        ...gameState,
        chess: {
          board: nextBoard,
          turn: turn === "w" ? "b" : "w",
          history: [...history, moveStr]
        }
      };

      updateGameState(nextState);
      setSelectedCell(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-6 items-center lg:items-stretch justify-center">
      {/* Chess Board Column */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-[440px]">
        {/* Status Indicator */}
        <div className="text-center bg-surface/30 border border-border/40 rounded-xl p-3 w-full backdrop-blur-sm">
          {myRole ? (
            isMyTurn ? (
              <span className="text-accent font-semibold animate-pulse">Your Turn ({myRole === "w" ? "White" : "Black"})</span>
            ) : (
              <span>Waiting for opponent... ({turn === "w" ? "White" : "Black"}'s Turn)</span>
            )
          ) : (
            <span className="text-muted flex items-center justify-center gap-1.5">
              <ShieldAlert size={14} /> Spectator Mode
            </span>
          )}
        </div>

        {/* 8x8 Board Grid */}
        <div className="w-full aspect-square border border-border/40 rounded-2xl overflow-hidden shadow-2xl bg-surface/10 p-2">
          <div className="grid grid-rows-8 h-full w-full">
            {board.map((rowArr, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-8 w-full h-full">
                {rowArr.map((piece, colIdx) => {
                  const isDark = (rowIdx + colIdx) % 2 === 1;
                  const isSelected = selectedCell?.[0] === rowIdx && selectedCell?.[1] === colIdx;
                  
                  return (
                    <button
                      key={colIdx}
                      onClick={() => handleCellClick(rowIdx, colIdx)}
                      className={`w-full h-full flex items-center justify-center text-3xl font-normal transition-all relative ${
                        isDark ? "bg-[#302E2B]" : "bg-[#F0D9B5]"
                      } ${isSelected ? "ring-4 ring-accent ring-inset" : ""}`}
                    >
                      {piece && (
                        <span
                          className={`select-none ${
                            piece.startsWith("w") ? "text-[#ffffff] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-[#000000]"
                          }`}
                        >
                          {PIECES[piece]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Control panel and history */}
      <div className="w-full lg:w-64 flex flex-col gap-4 bg-surface/20 border border-border/40 rounded-2xl p-4">
        {/* Seats */}
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2.5">Seats</h4>
          <div className="space-y-2.5">
            {/* White Player */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded bg-white border border-border/60" />
                <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {playerWhite ? getPeerName(playerWhite) : "Vacant"}
                </span>
              </div>
              {playerWhite ? (
                playerWhite === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("white")}>
                    Leave
                  </button>
                )
              ) : (
                !myRole && (
                  <button className="text-[10px] text-accent hover:underline font-bold" onClick={() => joinRole("white")}>
                    Sit
                  </button>
                )
              )}
            </div>

            {/* Black Player */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded bg-[#302E2B] border border-border/40" />
                <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {playerBlack ? getPeerName(playerBlack) : "Vacant"}
                </span>
              </div>
              {playerBlack ? (
                playerBlack === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("black")}>
                    Leave
                  </button>
                )
              ) : (
                !myRole && (
                  <button className="text-[10px] text-accent hover:underline font-bold" onClick={() => joinRole("black")}>
                    Sit
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* History / Log */}
        <div className="border-t border-border/30 pt-3 flex-1 flex flex-col min-h-0">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Move Log</h4>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[140px] bg-black/20 p-2.5 rounded-xl border border-border/10 font-mono text-[10px] text-muted">
            {history.length === 0 && <span className="opacity-40">No moves yet.</span>}
            {history.map((h, idx) => (
              <div key={idx} className="flex justify-between border-b border-border/5 pb-1">
                <span>{Math.floor(idx / 2) + 1}. {idx % 2 === 0 ? "White" : "Black"}</span>
                <span className="text-white font-bold">{h}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
