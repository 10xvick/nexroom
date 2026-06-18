import React, { useRef, useEffect, useState } from "react";
import type { ModuleProps } from "../../core/types";
import type { GameState } from "./GamesModule";
import { User, ShieldAlert, Sparkles, Award, Trophy } from "lucide-react";

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
  
  // Track which cells have already completed their draw animation
  const animatedCellsRef = useRef<Set<number>>(new Set());
  // Store animation progress values [0..1] for currently animating cells
  const animProgressRef = useRef<Record<number, number>>({});
  const animationFrameIdRef = useRef<number | null>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

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
    animatedCellsRef.current.clear();
    animProgressRef.current = {};
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

  // Sync animations when board updates
  useEffect(() => {
    board.forEach((cell, idx) => {
      if (cell && !animatedCellsRef.current.has(idx) && animProgressRef.current[idx] === undefined) {
        animProgressRef.current[idx] = 0; // start animating this cell
      }
    });

    // Clear animations for cells that were cleared (on reset)
    animatedCellsRef.current.forEach((idx) => {
      if (!board[idx]) {
        animatedCellsRef.current.delete(idx);
      }
    });
  }, [board]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isAnimating = false;

    const draw = () => {
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.width * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.width;
      const cellSize = w / 3;

      ctx.clearRect(0, 0, w, h);

      // Draw premium grid background
      ctx.fillStyle = "#12141c";
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid lines with linear gradients
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";

      ctx.beginPath();
      // Verticals
      ctx.moveTo(cellSize, 24);
      ctx.lineTo(cellSize, h - 24);
      ctx.moveTo(cellSize * 2, 24);
      ctx.lineTo(cellSize * 2, h - 24);
      // Horizontals
      ctx.moveTo(24, cellSize);
      ctx.lineTo(w - 24, cellSize);
      ctx.moveTo(24, cellSize * 2);
      ctx.lineTo(w - 24, cellSize * 2);
      ctx.stroke();

      isAnimating = false;

      // Draw pieces
      board.forEach((cell, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        const size = cellSize * 0.28;

        // Draw ghost hover indicator for active player's turn
        if (!cell && idx === hoveredCell && myMark && isMyTurn && !winner) {
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          if (myMark === "X") {
            ctx.strokeStyle = "#3b82f6";
            ctx.beginPath();
            ctx.moveTo(cx - size, cy - size);
            ctx.lineTo(cx + size, cy + size);
            ctx.moveTo(cx + size, cy - size);
            ctx.lineTo(cx - size, cy + size);
            ctx.stroke();
          } else {
            ctx.strokeStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(cx, cy, size, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (!cell) return;

        // Handle animation step
        let progress = 1;
        if (animProgressRef.current[idx] !== undefined) {
          progress = animProgressRef.current[idx];
          if (progress < 1) {
            progress += 0.08; // speed of animation
            if (progress >= 1) {
              progress = 1;
              animatedCellsRef.current.add(idx);
              delete animProgressRef.current[idx];
            } else {
              animProgressRef.current[idx] = progress;
              isAnimating = true;
            }
          }
        }

        ctx.save();
        ctx.lineWidth = 7;
        ctx.lineCap = "round";

        if (cell === "X") {
          ctx.strokeStyle = "#3b82f6";
          ctx.shadowColor = "rgba(59, 130, 246, 0.4)";
          ctx.shadowBlur = 12;

          // First diagonal line animation
          const p1 = Math.min(progress * 2, 1);
          ctx.beginPath();
          ctx.moveTo(cx - size, cy - size);
          ctx.lineTo(cx - size + (size * 2) * p1, cy - size + (size * 2) * p1);
          ctx.stroke();

          // Second diagonal line animation
          if (progress > 0.5) {
            const p2 = Math.min((progress - 0.5) * 2, 1);
            ctx.beginPath();
            ctx.moveTo(cx + size, cy - size);
            ctx.lineTo(cx + size - (size * 2) * p2, cy - size + (size * 2) * p2);
            ctx.stroke();
          }
        } else if (cell === "O") {
          ctx.strokeStyle = "#f59e0b";
          ctx.shadowColor = "rgba(245, 158, 11, 0.4)";
          ctx.shadowBlur = 12;

          // Circle arc draw animation
          ctx.beginPath();
          ctx.arc(cx, cy, size, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2) * progress);
          ctx.stroke();
        }

        ctx.restore();
      });

      if (isAnimating) {
        animationFrameIdRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [board, hoveredCell, isMyTurn, myMark, winner]);

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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      setHoveredCell(index);
    } else {
      setHoveredCell(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-6 items-center lg:items-stretch justify-center animate-fade-in">
      {/* Game Board Column */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 max-w-sm w-full">
        {/* Status Indicator Bar */}
        <div className="text-center bg-[#11131c]/60 border border-border/40 rounded-2xl p-4 w-full backdrop-blur-md shadow-md">
          {winner ? (
            <p className="text-base font-extrabold text-success flex items-center justify-center gap-2">
              <Trophy size={16} className="text-success animate-bounce" />
              {winner === myMark ? "Victory! You win! 🎉" : `${getPeerName(gameState.players[winner])} wins! 🏆`}
            </p>
          ) : isDraw ? (
            <p className="text-base font-extrabold text-muted">A Hard-Fought Draw! 🤝</p>
          ) : (
            <div className="text-sm font-semibold text-muted">
              {myMark ? (
                isMyTurn ? (
                  <span className="text-accent flex items-center justify-center gap-2 animate-pulse">
                    <Sparkles size={14} className="text-accent animate-spin" />
                    Your turn! Make your move...
                  </span>
                ) : (
                  <span>Waiting for opponent... ({xTurn ? "X" : "O"}'s Turn)</span>
                )
              ) : (
                <span className="text-muted flex items-center justify-center gap-1.5 uppercase tracking-wider text-xs">
                  <ShieldAlert size={13} className="text-muted" /> Spectator Mode
                </span>
              )}
            </div>
          )}
        </div>

        {/* 3x3 Canvas Grid */}
        <div className="w-full aspect-square bg-[#12141c]/50 rounded-3xl border border-border/40 overflow-hidden shadow-2xl relative group">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`w-full h-full block transition-all duration-300 ${
              myMark && isMyTurn && !winner ? "cursor-pointer" : "cursor-not-allowed"
            }`}
          />
        </div>

        {/* Local Reset */}
        {(winner || isDraw) && (
          <button className="btn-primary w-full py-3 rounded-2xl text-sm font-bold animate-slide-up" onClick={resetBoard}>
            Start Next Match
          </button>
        )}
      </div>

      {/* Players List & Scoreboard Panel */}
      <div className="w-full lg:w-72 flex flex-col gap-4 bg-[#11131c]/40 border border-border/40 rounded-3xl p-5 shadow-lg backdrop-blur-md">
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 select-none">Roles</h4>
          <div className="space-y-2.5">
            {/* Player X */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-accent font-black text-base w-6 text-center select-none">X</span>
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerX ? getPeerName(playerX) : "Empty Seat"}
                </span>
              </div>
              {playerX ? (
                playerX === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("X")}>
                    Leave
                  </button>
                )
              ) : (
                !myMark && (
                  <button className="text-[10px] text-accent hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("X")}>
                    Join
                  </button>
                )
              )}
            </div>

            {/* Player O */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-warn font-black text-base w-6 text-center select-none">O</span>
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerO ? getPeerName(playerO) : "Empty Seat"}
                </span>
              </div>
              {playerO ? (
                playerO === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("O")}>
                    Leave
                  </button>
                )
              ) : (
                !myMark && (
                  <button className="text-[10px] text-warn hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("O")}>
                    Join
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Score Board */}
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5 select-none">
            <Award size={12} /> Scoreboard
          </h4>
          <div className="grid grid-cols-2 text-center border border-border/20 bg-surface/30 rounded-2xl py-3.5">
            <div>
              <p className="text-[10px] text-muted font-extrabold uppercase tracking-wider">X Matches</p>
              <p className="text-xl font-black text-white mt-1">{scoreX}</p>
            </div>
            <div className="border-l border-border/20">
              <p className="text-[10px] text-muted font-extrabold uppercase tracking-wider">O Matches</p>
              <p className="text-xl font-black text-white mt-1">{scoreO}</p>
            </div>
          </div>
        </div>

        {/* Spectators List */}
        <div className="border-t border-border/20 pt-4 flex-1 flex flex-col min-h-0">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 select-none">Spectators</h4>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[140px]">
            {peerList
              .filter((p) => p.peerId !== playerX && p.peerId !== playerO)
              .map((p) => (
                <div key={p.peerId} className="flex items-center gap-2 text-xs text-muted/80 font-medium">
                  <User size={11} className="text-muted/60" />
                  <span className="truncate">{p.peerName}</span>
                </div>
              ))}
            {selfId !== playerX && selfId !== playerO && (
              <div className="flex items-center gap-2 text-xs text-accent font-bold">
                <User size={11} className="text-accent/60" />
                <span>You (spectating)</span>
              </div>
            )}
            {peerList.filter((p) => p.peerId !== playerX && p.peerId !== playerO).length === 0 && 
             (selfId === playerX || selfId === playerO) && (
              <p className="text-[10px] text-muted/50 italic select-none">No spectators</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
