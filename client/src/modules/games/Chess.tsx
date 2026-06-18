import React, { useState, useRef, useEffect } from "react";
import type { ModuleProps } from "../../core/types";
import type { GameState } from "./GamesModule";
import { User, ShieldAlert, Award, Play } from "lucide-react";

interface ChessProps extends ModuleProps {
  gameState: GameState;
  updateGameState: (nextState: GameState) => void;
  joinRole: (role: string) => void;
  leaveRole: (role: string) => void;
}

// Programmatic path drawer for Chess pieces
function drawPiece(ctx: CanvasRenderingContext2D, piece: string, x: number, y: number, size: number) {
  const isWhite = piece.startsWith("w");
  const type = piece.slice(1);

  ctx.save();
  ctx.translate(x, y);

  // Setup styles
  ctx.strokeStyle = isWhite ? "#1e293b" : "#f8fafc";
  ctx.lineWidth = size * 0.05;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Fill gradient
  const grad = ctx.createRadialGradient(0, -size * 0.05, 0, 0, 0, size * 0.45);
  if (isWhite) {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#cbd5e1");
  } else {
    grad.addColorStop(0, "#334155");
    grad.addColorStop(1, "#0f172a");
  }
  ctx.fillStyle = grad;

  // Add subtle drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();

  const r = size * 0.35; // base bounds radius

  if (type === "P") {
    // Pawn
    ctx.arc(0, -size * 0.18, size * 0.15, 0, Math.PI * 2); // Head
    ctx.moveTo(-size * 0.1, -size * 0.03); // Collar
    ctx.lineTo(size * 0.1, -size * 0.03);
    ctx.lineTo(size * 0.15, size * 0.25); // Base
    ctx.lineTo(-size * 0.15, size * 0.25);
    ctx.closePath();
  } else if (type === "R") {
    // Rook
    ctx.moveTo(-size * 0.18, -size * 0.25); // Top battlements
    ctx.lineTo(-size * 0.18, -size * 0.12);
    ctx.lineTo(-size * 0.08, -size * 0.12);
    ctx.lineTo(-size * 0.08, -size * 0.25);
    ctx.lineTo(size * 0.08, -size * 0.25);
    ctx.lineTo(size * 0.08, -size * 0.12);
    ctx.lineTo(size * 0.18, -size * 0.12);
    ctx.lineTo(size * 0.18, -size * 0.25);
    // Body and Base
    ctx.lineTo(size * 0.2, size * 0.25);
    ctx.lineTo(-size * 0.2, size * 0.25);
    ctx.closePath();
  } else if (type === "N") {
    // Knight (Horse head)
    ctx.moveTo(-size * 0.15, size * 0.25); // base bottom-left
    ctx.lineTo(size * 0.18, size * 0.25); // base bottom-right
    ctx.quadraticCurveTo(size * 0.18, size * 0.05, size * 0.1, -size * 0.05); // neck curve right
    ctx.lineTo(size * 0.2, -size * 0.15); // snout bottom
    ctx.lineTo(size * 0.08, -size * 0.28); // snout top
    ctx.quadraticCurveTo(-size * 0.08, -size * 0.32, -size * 0.05, -size * 0.15); // forehead / nose bridge
    ctx.lineTo(-size * 0.15, -size * 0.22); // ear back
    ctx.quadraticCurveTo(-size * 0.15, size * 0.05, -size * 0.15, size * 0.25); // back neck curve
    ctx.closePath();
  } else if (type === "B") {
    // Bishop (Mitre hat)
    ctx.arc(0, -size * 0.22, size * 0.05, 0, Math.PI * 2); // Cross-globe on top
    // Body mitre shape
    ctx.moveTo(0, -size * 0.17);
    ctx.bezierCurveTo(-size * 0.2, -size * 0.12, -size * 0.18, size * 0.15, -size * 0.18, size * 0.25);
    ctx.lineTo(size * 0.18, size * 0.25);
    ctx.bezierCurveTo(size * 0.18, size * 0.15, size * 0.2, -size * 0.12, 0, -size * 0.17);
    ctx.closePath();
  } else if (type === "Q") {
    // Queen (Spiked crown)
    ctx.moveTo(-size * 0.22, size * 0.25);
    ctx.lineTo(-size * 0.22, -size * 0.1);
    ctx.lineTo(-size * 0.12, -size * 0.25);
    ctx.lineTo(-size * 0.05, -size * 0.1);
    ctx.lineTo(0, -size * 0.28); // center peak
    ctx.lineTo(size * 0.05, -size * 0.1);
    ctx.lineTo(size * 0.12, -size * 0.25);
    ctx.lineTo(size * 0.22, -size * 0.1);
    ctx.lineTo(size * 0.22, size * 0.25);
    ctx.closePath();
  } else if (type === "K") {
    // King (Crown + cross)
    // Cross
    ctx.moveTo(-size * 0.05, -size * 0.26);
    ctx.lineTo(size * 0.05, -size * 0.26);
    ctx.moveTo(0, -size * 0.31);
    ctx.lineTo(0, -size * 0.21);
    // Base crown
    ctx.moveTo(-size * 0.2, size * 0.25);
    ctx.lineTo(-size * 0.2, -size * 0.1);
    ctx.lineTo(0, -size * 0.18);
    ctx.lineTo(size * 0.2, -size * 0.1);
    ctx.lineTo(size * 0.2, size * 0.25);
    ctx.closePath();
  }

  ctx.fill();
  ctx.shadowBlur = 0; // disable shadow for stroke border
  ctx.stroke();

  // Draw minor detail details
  if (type === "B") {
    // Diagonal slit for Bishop mitre
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, -size * 0.05);
    ctx.lineTo(size * 0.08, -size * 0.12);
    ctx.strokeStyle = isWhite ? "#475569" : "#94a3b8";
    ctx.lineWidth = size * 0.035;
    ctx.stroke();
  }

  ctx.restore();
}

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Canvas rendering logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.width;
    const cellSize = w / 8;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const isSelected = selectedCell?.[0] === r && selectedCell?.[1] === c;

        // Draw square cell with subtle gradients
        const sx = c * cellSize;
        const sy = r * cellSize;
        const grad = ctx.createLinearGradient(sx, sy, sx + cellSize, sy + cellSize);
        if (isDark) {
          grad.addColorStop(0, "#48382c"); // Dark wood/ceramic color
          grad.addColorStop(1, "#362921");
        } else {
          grad.addColorStop(0, "#f3dfc2"); // Light wood/ceramic color
          grad.addColorStop(1, "#e2ca9c");
        }

        ctx.fillStyle = grad;
        ctx.fillRect(sx, sy, cellSize, cellSize);

        // Highlight selection
        if (isSelected) {
          ctx.fillStyle = "rgba(79, 142, 247, 0.4)";
          ctx.fillRect(sx, sy, cellSize, cellSize);
          ctx.strokeStyle = "#4f8ef7";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(sx + 1.25, sy + 1.25, cellSize - 2.5, cellSize - 2.5);
        }

        // Draw piece vectors programmatically
        const piece = board[r][c];
        if (piece) {
          const px = c * cellSize + cellSize / 2;
          const py = r * cellSize + cellSize / 2;
          drawPiece(ctx, piece, px, py, cellSize);
        }
      }
    }
  }, [board, selectedCell]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = rect.width / 8;

    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (row >= 0 && row < 8 && col >= 0 && col < 8) {
      handleCellClick(row, col);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-6 items-center lg:items-stretch justify-center animate-fade-in">
      {/* Chess Board Column */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-[440px] w-full">
        {/* Status Indicator */}
        <div className="text-center bg-[#11131c]/60 border border-border/40 rounded-2xl p-4 w-full backdrop-blur-md shadow-md">
          {myRole ? (
            isMyTurn ? (
              <span className="text-accent font-extrabold flex items-center justify-center gap-2 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                Your turn! ({myRole === "w" ? "White" : "Black"})
              </span>
            ) : (
              <span className="font-semibold text-muted">Waiting for opponent... ({turn === "w" ? "White" : "Black"}'s Turn)</span>
            )
          ) : (
            <span className="text-muted flex items-center justify-center gap-1.5 uppercase text-xs tracking-wider font-bold">
              <ShieldAlert size={14} className="text-muted" /> Spectator Mode
            </span>
          )}
        </div>

        {/* 8x8 Canvas Board */}
        <div className="w-full aspect-square border border-border/40 rounded-3xl overflow-hidden shadow-2xl bg-[#12141c]/50 p-2.5">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`w-full h-full block rounded-2xl ${myRole ? "cursor-pointer" : "cursor-not-allowed"}`}
          />
        </div>
      </div>

      {/* Control panel and history */}
      <div className="w-full lg:w-72 flex flex-col gap-4 bg-[#11131c]/40 border border-border/40 rounded-3xl p-5 shadow-lg backdrop-blur-md">
        {/* Seats */}
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 select-none">Seats</h4>
          <div className="space-y-2.5">
            {/* White Player */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4.5 h-4.5 rounded bg-white border border-border/60 shadow-inner" />
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerWhite ? getPeerName(playerWhite) : "Vacant Seat"}
                </span>
              </div>
              {playerWhite ? (
                playerWhite === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("white")}>
                    Leave
                  </button>
                )
              ) : (
                !myRole && (
                  <button className="text-[10px] text-accent hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("white")}>
                    Sit White
                  </button>
                )
              )}
            </div>

            {/* Black Player */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4.5 h-4.5 rounded bg-[#272522] border border-[#403e3a] shadow-inner" />
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerBlack ? getPeerName(playerBlack) : "Vacant Seat"}
                </span>
              </div>
              {playerBlack ? (
                playerBlack === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("black")}>
                    Leave
                  </button>
                )
              ) : (
                !myRole && (
                  <button className="text-[10px] text-accent hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("black")}>
                    Sit Black
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* History / Log */}
        <div className="border-t border-border/20 pt-4 flex-1 flex flex-col min-h-0">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5 select-none">
            <Play size={12} className="text-accent" /> Move Log
          </h4>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[160px] bg-black/30 p-3 rounded-2xl border border-border/15 font-mono text-[11px] text-muted">
            {history.length === 0 && <span className="opacity-40 select-none">No moves yet. Make a move!</span>}
            {history.map((h, idx) => (
              <div key={idx} className="flex justify-between border-b border-white/5 pb-1 font-semibold">
                <span>{Math.floor(idx / 2) + 1}. {idx % 2 === 0 ? "White" : "Black"}</span>
                <span className="text-white">{h}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
