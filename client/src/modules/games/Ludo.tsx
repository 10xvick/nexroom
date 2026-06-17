import React, { useRef, useEffect } from "react";
import type { ModuleProps } from "../../core/types";
import type { GameState } from "./GamesModule";
import { User, ShieldAlert, Dice5 } from "lucide-react";

interface LudoProps extends ModuleProps {
  gameState: GameState;
  updateGameState: (nextState: GameState) => void;
  joinRole: (role: string) => void;
  leaveRole: (role: string) => void;
}

const COLORS = {
  red: "#EF4444",
  green: "#10B981"
};

// Simplified board path coordinates for rendering a circular track of 20 squares
// 0 to 9 are Red's half, 10 to 19 are Green's half
const PATH_COORDS = [
  { r: 4, c: 0 }, { r: 4, c: 1 }, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 3, c: 3 },
  { r: 2, c: 3 }, { r: 1, c: 3 }, { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 },
  { r: 0, c: 6 }, { r: 1, c: 6 }, { r: 2, c: 6 }, { r: 3, c: 6 }, { r: 4, c: 6 },
  { r: 4, c: 7 }, { r: 4, c: 8 }, { r: 4, c: 9 }, { r: 5, c: 9 }, { r: 5, c: 8 },
];

export default function Ludo({
  selfId,
  peers,
  gameState,
  updateGameState,
  joinRole,
  leaveRole
}: LudoProps) {
  const { positions, turn, diceValue, hasRolled } = gameState.ludo;
  const playerRed = gameState.players["red"];
  const playerGreen = gameState.players["green"];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const peerList = Array.from(peers.values());
  const getPeerName = (id: string) => {
    if (id === selfId) return "You";
    return peers.get(id)?.peerName || id.slice(0, 8);
  };

  const myColor = playerRed === selfId ? "red" : playerGreen === selfId ? "green" : null;
  const isMyTurn = myColor === turn;

  const rollDice = () => {
    if (!isMyTurn || hasRolled) return;
    const value = Math.floor(Math.random() * 6) + 1;
    
    updateGameState({
      ...gameState,
      ludo: {
        ...gameState.ludo,
        diceValue: value,
        hasRolled: true
      }
    });
  };

  const moveToken = (tokenId: string) => {
    if (!isMyTurn || !hasRolled) return;
    if (!tokenId.startsWith(turn)) return;

    const currentPos = positions[tokenId];
    let nextPos = currentPos;

    if (currentPos === -1) {
      // Need a 6 to hatch onto starting square (0 for red, 10 for green)
      if (diceValue === 6) {
        nextPos = turn === "red" ? 0 : 10;
      }
    } else {
      nextPos = currentPos + diceValue;
      // Max position on track is 19
      if (nextPos > 19) {
        nextPos = 19; // Goal reached
      }
    }

    const nextPositions = { ...positions, [tokenId]: nextPos };
    
    // Check if we captured opponent's token (same landing square, not home/goal)
    if (nextPos !== -1 && nextPos !== 19) {
      Object.keys(nextPositions).forEach((key) => {
        if (!key.startsWith(turn) && nextPositions[key] === nextPos) {
          nextPositions[key] = -1; // Send back home!
        }
      });
    }

    // Toggle turn
    const nextTurn = turn === "red" ? "green" : "red";

    updateGameState({
      ...gameState,
      ludo: {
        positions: nextPositions,
        turn: nextTurn,
        diceValue: 1,
        hasRolled: false
      }
    });
  };

  // Helper to get coordinates for tokens inside their base
  const getBaseCoords = (tokenId: string, cellSize: number) => {
    if (tokenId === "red_0") return { x: 1.5 * cellSize, y: 1.5 * cellSize };
    if (tokenId === "red_1") return { x: 2.5 * cellSize, y: 1.5 * cellSize };
    if (tokenId === "green_0") return { x: 7.5 * cellSize, y: 7.5 * cellSize };
    return { x: 8.5 * cellSize, y: 7.5 * cellSize }; // green_1
  };

  // Draw board on canvas
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
    const cellSize = w / 10;

    // 1. Draw clear dark background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#201F1D";
    ctx.fillRect(0, 0, w, h);

    // 2. Draw red start base (top-left 3x3 cells)
    ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
    ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
    ctx.lineWidth = 2;
    ctx.fillRect(0.5 * cellSize, 0.5 * cellSize, 3 * cellSize, 3 * cellSize);
    ctx.strokeRect(0.5 * cellSize, 0.5 * cellSize, 3 * cellSize, 3 * cellSize);

    ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
    ctx.font = `bold ${cellSize * 0.45}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RED BASE", 2 * cellSize, 2.7 * cellSize);

    // 3. Draw green start base (bottom-right 3x3 cells)
    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.fillRect(6.5 * cellSize, 6.5 * cellSize, 3 * cellSize, 3 * cellSize);
    ctx.strokeRect(6.5 * cellSize, 6.5 * cellSize, 3 * cellSize, 3 * cellSize);

    ctx.fillStyle = "rgba(16, 185, 129, 0.8)";
    ctx.fillText("GREEN BASE", 8 * cellSize, 8.7 * cellSize);

    // 4. Draw track squares
    PATH_COORDS.forEach((cell, idx) => {
      const cx = cell.c * cellSize;
      const cy = cell.r * cellSize;

      const isRedHalf = idx < 10;
      ctx.fillStyle = isRedHalf ? "rgba(239, 68, 68, 0.18)" : "rgba(16, 185, 129, 0.18)";
      ctx.strokeStyle = isRedHalf ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.35)";
      ctx.lineWidth = 1.5;

      ctx.fillRect(cx, cy, cellSize, cellSize);
      ctx.strokeRect(cx, cy, cellSize, cellSize);

      // Label track coordinates subtly
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = `${cellSize * 0.3}px monospace`;
      ctx.fillText(idx.toString(), cx + cellSize / 2, cy + cellSize / 2);
    });

    // 5. Draw tokens
    Object.keys(positions).forEach((tok) => {
      const pos = positions[tok];
      const color = tok.startsWith("red") ? COLORS.red : COLORS.green;
      const isRedToken = tok.startsWith("red");

      let tx = 0;
      let ty = 0;

      if (pos === -1) {
        const coords = getBaseCoords(tok, cellSize);
        tx = coords.x;
        ty = coords.y;
      } else {
        const cell = PATH_COORDS[pos];
        const tokensOnSquare = Object.keys(positions).filter(k => positions[k] === pos);
        const idx = tokensOnSquare.indexOf(tok);

        tx = cell.c * cellSize + cellSize / 2;
        ty = cell.r * cellSize + cellSize / 2;

        if (tokensOnSquare.length > 1) {
          // Offset tokens slightly on same cell
          tx += (idx - (tokensOnSquare.length - 1) / 2) * (cellSize * 0.45);
        }
      }

      // Draw Token Circle
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Highlight border if playable
      const isPlayable = isMyTurn && hasRolled && isRedToken === (turn === "red");
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.28, 0, Math.PI * 2);
      ctx.strokeStyle = isPlayable ? "#ffffff" : "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = isPlayable ? 3.5 : 1.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });

  }, [positions, turn, hasRolled, isMyTurn]);

  // Click handler on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = rect.width / 10;
    const tokenRadius = cellSize * 0.35;

    // Check click distance on all tokens
    let clickedTokenId: string | null = null;
    const tokenIds = Object.keys(positions);

    for (const tok of tokenIds) {
      const pos = positions[tok];
      let tx = 0;
      let ty = 0;

      if (pos === -1) {
        const coords = getBaseCoords(tok, cellSize);
        tx = coords.x;
        ty = coords.y;
      } else {
        const cell = PATH_COORDS[pos];
        const tokensOnSquare = Object.keys(positions).filter(k => positions[k] === pos);
        const idx = tokensOnSquare.indexOf(tok);

        tx = cell.c * cellSize + cellSize / 2;
        ty = cell.r * cellSize + cellSize / 2;

        if (tokensOnSquare.length > 1) {
          tx += (idx - (tokensOnSquare.length - 1) / 2) * (cellSize * 0.45);
        }
      }

      const dist = Math.hypot(x - tx, y - ty);
      if (dist <= tokenRadius) {
        clickedTokenId = tok;
        break;
      }
    }

    if (clickedTokenId) {
      moveToken(clickedTokenId);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-6 items-center lg:items-stretch justify-center">
      {/* Board & Controls */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-[360px]">
        {/* Status */}
        <div className="text-center bg-surface/30 border border-border/40 rounded-xl p-3 w-full backdrop-blur-sm">
          {myColor ? (
            isMyTurn ? (
              <span className="text-accent font-semibold animate-pulse">
                Your Turn (Roll or Move {turn === "red" ? "Red" : "Green"})
              </span>
            ) : (
              <span>Waiting for {turn === "red" ? "Red" : "Green"}...</span>
            )
          ) : (
            <span className="text-muted flex items-center justify-center gap-1.5">
              <ShieldAlert size={14} /> Spectator Mode
            </span>
          )}
        </div>

        {/* Dice Controls Card */}
        <div className="flex items-center gap-4 bg-surface/40 border border-border rounded-xl p-3 w-full justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-accent/20 border-2 border-accent rounded-xl flex items-center justify-center text-accent text-2xl font-black">
              {diceValue}
            </div>
            <span className="text-xs text-muted">Dice Value</span>
          </div>

          <button
            onClick={rollDice}
            disabled={!isMyTurn || hasRolled}
            className="btn-primary py-2 px-4 text-xs gap-1.5"
          >
            <Dice5 size={14} /> Roll Dice
          </button>
        </div>

        {/* Board Canvas */}
        <div className="w-full aspect-square border border-border/40 rounded-2xl overflow-hidden bg-[#201F1D]">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`w-full h-full block ${isMyTurn && hasRolled ? "cursor-pointer" : "cursor-not-allowed"}`}
          />
        </div>
      </div>

      {/* Control panel and seats */}
      <div className="w-full lg:w-64 flex flex-col gap-4 bg-surface/20 border border-border/40 rounded-2xl p-4">
        {/* Seats */}
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2.5">Seats</h4>
          <div className="space-y-2.5">
            {/* Red Player */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {playerRed ? getPeerName(playerRed) : "Vacant"}
                </span>
              </div>
              {playerRed ? (
                playerRed === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("red")}>
                    Leave
                  </button>
                )
              ) : (
                !myColor && (
                  <button className="text-[10px] text-accent hover:underline font-bold" onClick={() => joinRole("red")}>
                    Sit
                  </button>
                )
              )}
            </div>

            {/* Green Player */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {playerGreen ? getPeerName(playerGreen) : "Vacant"}
                </span>
              </div>
              {playerGreen ? (
                playerGreen === selfId && (
                  <button className="text-[10px] text-danger hover:underline" onClick={() => leaveRole("green")}>
                    Leave
                  </button>
                )
              ) : (
                !myColor && (
                  <button className="text-[10px] text-accent hover:underline font-bold" onClick={() => joinRole("green")}>
                    Sit
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Ludo Game Manual / Rules */}
        <div className="border-t border-border/30 pt-3 text-[10px] text-muted flex flex-col gap-1.5 leading-relaxed">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-1">How to Play</h4>
          <p>• Roll a <b>6</b> to deploy a token from home base to the track.</p>
          <p>• Move tokens forward along the track squares.</p>
          <p>• Land on an opponent's token to capture it and send it back home.</p>
          <p>• First to get all tokens to the goal wins.</p>
        </div>
      </div>
    </div>
  );
}
