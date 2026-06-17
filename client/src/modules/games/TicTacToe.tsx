import React, { useRef, useEffect } from "react";
import type { ModuleProps } from "../../core/types";
import type { GameState } from "./GamesModule";
import { User, ShieldAlert } from "lucide-react";

interface TicTacToeProps extends ModuleProps {
  gameState: GameState;
  updateGameState: (nextState: GameState) => void;
  joinRole: (role: string) => void;
  leaveRole: (role: string) => void;
}

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6]            // diagonals
];

function checkWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export default function TicTacToe({
  selfId,
  peers,
  gameState,
  updateGameState,
  joinRole,
  leaveRole
}: TicTacToeProps) {
  const { board, xTurn, scoreX, scoreO } = gameState.tictactoe;
  const playerX = gameState.players["X"];
  const playerO = gameState.players["O"];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const peerList = Array.from(peers.values());
  const getPeerName = (id: string) => {
    if (id === selfId) return "You";
    return peers.get(id)?.peerName || id.slice(0, 8);
  };

  const myMark = playerX === selfId ? "X" : playerO === selfId ? "O" : null;
  const isMyTurn = (xTurn && myMark === "X") || (!xTurn && myMark === "O");
  const winner = checkWinner(board);
  const isDraw = !winner && board.every(Boolean);

  const move = (index: number) => {
    if (!myMark || !isMyTurn || board[index] || winner) return;
    const newBoard = [...board];
    newBoard[index] = myMark;

    const gameWinner = checkWinner(newBoard);
    let nextScoreX = scoreX;
    let nextScoreO = scoreO;

    if (gameWinner === "X") nextScoreX += 1;
    if (gameWinner === "O") nextScoreO += 1;

    const nextState: GameState = {
      ...gameState,
      tictactoe: {
        board: newBoard,
        xTurn: !xTurn,
        scoreX: nextScoreX,
        scoreO: nextScoreO
      }
    };
    updateGameState(nextState);
  };

  const resetBoard = () => {
    const nextState: GameState = {
      ...gameState,
      tictactoe: {
        board: Array(9).fill(null),
        xTurn: true,
        scoreX: scoreX,
        scoreO: scoreO
      }
    };
    updateGameState(nextState);
  };

  // Canvas Drawing Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Support High DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * dpr; // maintain square ratio
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.width;
    const cellSize = w / 3;

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    // Vertical grid lines
    ctx.beginPath();
    ctx.moveTo(cellSize, 16);
    ctx.lineTo(cellSize, h - 16);
    ctx.moveTo(cellSize * 2, 16);
    ctx.lineTo(cellSize * 2, h - 16);
    // Horizontal grid lines
    ctx.moveTo(16, cellSize);
    ctx.lineTo(w - 16, cellSize);
    ctx.moveTo(16, cellSize * 2);
    ctx.lineTo(w - 16, cellSize * 2);
    ctx.stroke();

    // Draw pieces
    board.forEach((cell, idx) => {
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;
      const size = cellSize * 0.28; // radius/half-size

      if (cell === "X") {
        ctx.strokeStyle = "#3b82f6"; // Tailwind blue-500
        ctx.shadowColor = "rgba(59, 130, 246, 0.4)";
        ctx.shadowBlur = 12;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - size, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.moveTo(cx + size, cy - size);
        ctx.lineTo(cx - size, cy + size);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      } else if (cell === "O") {
        ctx.strokeStyle = "#f59e0b"; // Tailwind amber-500
        ctx.shadowColor = "rgba(245, 158, 11, 0.4)";
        ctx.shadowBlur = 12;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }
    });
  }, [board]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!myMark || !isMyTurn || winner) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = rect.width / 3;

    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    const index = row * 3 + col;

    if (index >= 0 && index < 9) {
      move(index);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-6 items-center lg:items-stretch justify-center">
      {/* Game Board Column */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 max-w-sm">
        {/* Status indicator */}
        <div className="text-center bg-surface/30 border border-border/40 rounded-xl p-3 w-full backdrop-blur-sm">
          {winner ? (
            <p className="text-base font-bold text-success">
              {winner === myMark ? "You win! 🎉" : `${getPeerName(gameState.players[winner])} wins! 🏆`}
            </p>
          ) : isDraw ? (
            <p className="text-base font-bold text-muted">It's a draw! 🤝</p>
          ) : (
            <div className="text-sm text-muted">
              {myMark ? (
                isMyTurn ? (
                  <span className="text-accent font-semibold animate-pulse">Your Turn (Playing as {myMark})</span>
                ) : (
                  <span>Waiting for opponent... ({xTurn ? "X" : "O"}'s Turn)</span>
                )
              ) : (
                <span className="text-muted flex items-center justify-center gap-1.5">
                  <ShieldAlert size={14} /> Spectator Mode
                </span>
              )}
            </div>
          )}
        </div>

        {/* 3x3 Canvas Grid */}
        <div className="w-full aspect-square bg-surface/10 rounded-2xl border border-border/30 overflow-hidden shadow-2xl">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`w-full h-full block ${myMark && isMyTurn && !winner ? "cursor-pointer" : "cursor-not-allowed"}`}
          />
        </div>

        {/* Local Reset */}
        {(winner || isDraw) && (
          <button className="btn-primary w-full py-2.5 text-sm" onClick={resetBoard}>
            Play Again
          </button>
        )}
      </div>

      {/* Players list & scoreboard */}
      <div className="w-full lg:w-64 flex flex-col gap-4 bg-surface/20 border border-border/40 rounded-2xl p-4">
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Roles</h4>
          <div className="space-y-3">
            {/* Player X */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-accent font-extrabold text-sm w-5 text-center">X</span>
                <span className="text-xs font-semibold text-white truncate max-w-[100px]">
                  {playerX ? getPeerName(playerX) : "Vacant"}
                </span>
              </div>
              {playerX ? (
                playerX === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("X")}>
                    Leave
                  </button>
                )
              ) : (
                !myMark && (
                  <button className="text-[10px] text-accent hover:underline font-bold" onClick={() => joinRole("X")}>
                    Join
                  </button>
                )
              )}
            </div>

            {/* Player O */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-warn font-extrabold text-sm w-5 text-center">O</span>
                <span className="text-xs font-semibold text-white truncate max-w-[100px]">
                  {playerO ? getPeerName(playerO) : "Vacant"}
                </span>
              </div>
              {playerO ? (
                playerO === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("O")}>
                    Leave
                  </button>
                )
              ) : (
                !myMark && (
                  <button className="text-[10px] text-warn hover:underline font-bold" onClick={() => joinRole("O")}>
                    Join
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Score Board */}
        <div className="border-t border-border/30 pt-3">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Score</h4>
          <div className="grid grid-cols-2 text-center border border-border/20 bg-surface/30 rounded-xl py-2">
            <div>
              <p className="text-[10px] text-muted font-bold">X Wins</p>
              <p className="text-base font-extrabold text-white mt-0.5">{scoreX}</p>
            </div>
            <div className="border-l border-border/20">
              <p className="text-[10px] text-muted font-bold">O Wins</p>
              <p className="text-base font-extrabold text-white mt-0.5">{scoreO}</p>
            </div>
          </div>
        </div>

        {/* Spectators list */}
        <div className="border-t border-border/30 pt-3 flex-1 flex flex-col min-h-0">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Spectators</h4>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[120px]">
            {peerList
              .filter((p) => p.peerId !== playerX && p.peerId !== playerO)
              .map((p) => (
                <div key={p.peerId} className="flex items-center gap-1.5 text-xs text-muted">
                  <User size={10} />
                  <span className="truncate">{p.peerName}</span>
                </div>
              ))}
            {selfId !== playerX && selfId !== playerO && (
              <div className="flex items-center gap-1.5 text-xs text-accent font-semibold">
                <User size={10} />
                <span>You (spectating)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
