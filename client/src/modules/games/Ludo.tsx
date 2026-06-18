import React, { useRef, useEffect, useState } from "react";
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

// Circular track coordinates (20 cells total)
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
  
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [diceRollProgress, setDiceRollProgress] = useState(1);

  // Resize Panel States
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 16;
      if (newWidth > 200 && newWidth < 500) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const peerList = Array.from(peers.values());
  const getPeerName = (id: string) => {
    if (id === selfId) return "You";
    return peers.get(id)?.peerName || id.slice(0, 8);
  };

  const myColor = playerRed === selfId ? "red" : playerGreen === selfId ? "green" : null;
  const isMyTurn = myColor === turn;

  const rollDice = () => {
    if (!isMyTurn || hasRolled || isDiceRolling) return;
    
    setIsDiceRolling(true);
    let counter = 0;
    const interval = setInterval(() => {
      setDiceRollProgress(Math.floor(Math.random() * 6) + 1);
      counter++;
      if (counter > 8) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceRollProgress(finalValue);
        setIsDiceRolling(false);

        updateGameState({
          ...gameState,
          ludo: {
            ...gameState.ludo,
            diceValue: finalValue,
            hasRolled: true
          }
        });
      }
    }, 80);
  };

  // Convert the positions state stepsMoved (-1 to 19) to actual board coordinate indices
  const getAbsoluteBoardIndex = (tokenId: string, stepsMoved: number): number => {
    if (stepsMoved === -1 || stepsMoved === 19) return -1; // in base or home
    if (tokenId.startsWith("red")) {
      return stepsMoved; // Red starts at index 0
    } else {
      return (10 + stepsMoved) % 20; // Green starts at index 10
    }
  };

  const moveToken = (tokenId: string) => {
    if (!isMyTurn || !hasRolled || isDiceRolling) return;
    if (!tokenId.startsWith(turn)) return;

    const currentSteps = positions[tokenId] ?? -1;
    let nextSteps = currentSteps;

    if (currentSteps === -1) {
      // Need a 6 to hatch from base
      if (diceValue === 6) {
        nextSteps = 0; // hatches onto starting tile (0 steps moved)
      }
    } else {
      nextSteps = currentSteps + diceValue;
      if (nextSteps > 19) {
        nextSteps = 19; // Reach goal
      }
    }

    const nextPositions = { ...positions, [tokenId]: nextSteps };
    
    // Check for capturing opponent tokens
    const nextBoardIdx = getAbsoluteBoardIndex(tokenId, nextSteps);
    if (nextBoardIdx !== -1) {
      Object.keys(nextPositions).forEach((otherTok) => {
        if (!otherTok.startsWith(turn)) {
          const otherBoardIdx = getAbsoluteBoardIndex(otherTok, nextPositions[otherTok]);
          if (otherBoardIdx === nextBoardIdx) {
            nextPositions[otherTok] = -1; // Send captured token back home!
          }
        }
      });
    }

    // Toggle Turn
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

  // Fixed coordinates for 4 tokens inside their respective bases
  const getBaseCoords = (tokenId: string, cellSize: number) => {
    const isRed = tokenId.startsWith("red");
    const idx = parseInt(tokenId.split("-")[1]) || 0;

    const baseX = isRed ? 0.5 * cellSize : 6.5 * cellSize;
    const baseY = isRed ? 0.5 * cellSize : 6.5 * cellSize;

    // Arrange 4 tokens in a 2x2 grid inside their 3x3 base area
    const offsetX = (idx % 2 === 0 ? 0.8 : 2.2) * cellSize;
    const offsetY = (idx < 2 ? 0.8 : 2.2) * cellSize;

    return { x: baseX + offsetX, y: baseY + offsetY };
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

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#12141c";
    ctx.fillRect(0, 0, w, h);

    // 1. Draw Red Base (Top-Left)
    ctx.fillStyle = "rgba(239, 68, 68, 0.06)";
    ctx.strokeStyle = "rgba(239, 68, 68, 0.25)";
    ctx.lineWidth = 2;
    ctx.fillRect(0.5 * cellSize, 0.5 * cellSize, 3 * cellSize, 3 * cellSize);
    ctx.strokeRect(0.5 * cellSize, 0.5 * cellSize, 3 * cellSize, 3 * cellSize);

    ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
    ctx.font = `bold ${cellSize * 0.4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RED BASE", 2 * cellSize, 2.7 * cellSize);

    // 2. Draw Green Base (Bottom-Right)
    ctx.fillStyle = "rgba(16, 185, 129, 0.06)";
    ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
    ctx.fillRect(6.5 * cellSize, 6.5 * cellSize, 3 * cellSize, 3 * cellSize);
    ctx.strokeRect(6.5 * cellSize, 6.5 * cellSize, 3 * cellSize, 3 * cellSize);

    ctx.fillStyle = "rgba(16, 185, 129, 0.8)";
    ctx.fillText("GREEN BASE", 8 * cellSize, 8.7 * cellSize);

    // 3. Draw Track Tiles
    PATH_COORDS.forEach((cell, idx) => {
      const cx = cell.c * cellSize;
      const cy = cell.r * cellSize;

      const isRedHalf = idx < 10;
      ctx.fillStyle = isRedHalf ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)";
      ctx.strokeStyle = isRedHalf ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)";
      ctx.lineWidth = 1.5;

      ctx.fillRect(cx, cy, cellSize, cellSize);
      ctx.strokeRect(cx, cy, cellSize, cellSize);

      // Label track coordinates subtly
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = `${cellSize * 0.3}px monospace`;
      ctx.fillText(idx.toString(), cx + cellSize / 2, cy + cellSize / 2);
    });

    // 4. Draw Tokens
    Object.keys(positions).forEach((tok) => {
      const steps = positions[tok] ?? -1;
      const isRedToken = tok.startsWith("red");
      const color = isRedToken ? COLORS.red : COLORS.green;

      let tx = 0;
      let ty = 0;

      if (steps === -1) {
        // Base coordinate
        const coords = getBaseCoords(tok, cellSize);
        tx = coords.x;
        ty = coords.y;
      } else if (steps === 19) {
        // Goal coordinate (Red goal at top-left, Green goal at bottom-right)
        tx = isRedToken ? 2 * cellSize : 8 * cellSize;
        ty = isRedToken ? 2 * cellSize : 8 * cellSize;
      } else {
        const boardIdx = getAbsoluteBoardIndex(tok, steps);
        const cell = PATH_COORDS[boardIdx];
        
        // Handle multiple tokens on the same tile with a spread offset
        const tokensOnSquare = Object.keys(positions).filter(k => getAbsoluteBoardIndex(k, positions[k]) === boardIdx);
        const idxOnSquare = tokensOnSquare.indexOf(tok);

        tx = cell.c * cellSize + cellSize / 2;
        ty = cell.r * cellSize + cellSize / 2;

        if (tokensOnSquare.length > 1) {
          tx += (idxOnSquare - (tokensOnSquare.length - 1) / 2) * (cellSize * 0.4);
        }
      }

      ctx.save();
      // Draw shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      // Outer token circle
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Border highlight if playable
      ctx.shadowColor = "transparent"; // disable shadow for stroke
      const isPlayable = isMyTurn && hasRolled && isRedToken === (turn === "red");
      ctx.strokeStyle = isPlayable ? "#ffffff" : "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = isPlayable ? 3.5 : 1.5;
      ctx.stroke();

      // Inner center dot
      ctx.beginPath();
      ctx.arc(tx, ty, cellSize * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.restore();
    });

  }, [positions, turn, hasRolled, isMyTurn]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = rect.width / 10;
    const clickThreshold = cellSize * 0.45;

    let clickedTokenId: string | null = null;
    const tokenIds = Object.keys(positions);

    for (const tok of tokenIds) {
      const steps = positions[tok] ?? -1;
      let tx = 0;
      let ty = 0;

      if (steps === -1) {
        const coords = getBaseCoords(tok, cellSize);
        tx = coords.x;
        ty = coords.y;
      } else if (steps === 19) {
        const isRedToken = tok.startsWith("red");
        tx = isRedToken ? 2 * cellSize : 8 * cellSize;
        ty = isRedToken ? 2 * cellSize : 8 * cellSize;
      } else {
        const boardIdx = getAbsoluteBoardIndex(tok, steps);
        const cell = PATH_COORDS[boardIdx];
        const tokensOnSquare = Object.keys(positions).filter(k => getAbsoluteBoardIndex(k, positions[k]) === boardIdx);
        const idxOnSquare = tokensOnSquare.indexOf(tok);

        tx = cell.c * cellSize + cellSize / 2;
        ty = cell.r * cellSize + cellSize / 2;

        if (tokensOnSquare.length > 1) {
          tx += (idxOnSquare - (tokensOnSquare.length - 1) / 2) * (cellSize * 0.4);
        }
      }

      const dist = Math.hypot(x - tx, y - ty);
      if (dist <= clickThreshold) {
        clickedTokenId = tok;
        break;
      }
    }

    if (clickedTokenId) {
      moveToken(clickedTokenId);
    }
  };

  return (
    <div className={`flex h-full p-4 overflow-hidden gap-1 ${isResizing ? "select-none" : ""}`}>
      {/* Board & Dice Panel Column */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-0 overflow-y-auto pr-3">
        {/* Status indicator bar */}
        <div className="text-center bg-[#11131c]/60 border border-border/40 rounded-2xl p-3 w-full max-w-sm backdrop-blur-md shadow-md">
          {myColor ? (
            isMyTurn ? (
              <span className="text-accent font-extrabold flex items-center justify-center gap-2 animate-pulse text-xs">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                Your turn! ({hasRolled ? "Move a token" : "Roll the dice"})
              </span>
            ) : (
              <span className="font-semibold text-muted text-xs">Waiting for opponent... ({turn === "red" ? "Red" : "Green"}'s Turn)</span>
            )
          ) : (
            <span className="text-muted flex items-center justify-center gap-1.5 uppercase text-xs tracking-wider font-bold">
              <ShieldAlert size={12} className="text-muted" /> Spectator Mode
            </span>
          )}
        </div>

        {/* Dice Controls Card */}
        <div className="flex items-center gap-4 bg-[#11131c]/40 border border-border/40 rounded-2xl p-3.5 w-full max-w-sm justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div 
              className={`w-12 h-12 bg-accent/15 border-2 border-accent/40 rounded-2xl flex items-center justify-center text-accent text-2xl font-black shadow-inner transition-all duration-300 ${
                isDiceRolling ? "scale-90 rotate-45 border-accent" : ""
              }`}
            >
              {isDiceRolling ? diceRollProgress : diceValue}
            </div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Dice Value</span>
          </div>

          <button
            onClick={rollDice}
            disabled={!isMyTurn || hasRolled || isDiceRolling}
            className="btn-primary py-2 px-4 text-xs font-bold rounded-xl gap-2"
          >
            <Dice5 size={14} /> Roll Dice
          </button>
        </div>

        {/* Board Canvas */}
        <div 
          className="w-full aspect-square border border-border/40 rounded-3xl overflow-hidden shadow-2xl p-2 bg-[#12141c]/50"
          style={{
            maxHeight: "calc(100vh - 290px)",
            maxWidth: "min(100%, calc(100vh - 290px))"
          }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`w-full h-full block rounded-2xl ${
              isMyTurn && hasRolled ? "cursor-pointer" : "cursor-not-allowed"
            }`}
          />
        </div>
      </div>

      {/* Resize Handle Divider */}
      <div 
        onMouseDown={startResize}
        className={`w-[4px] cursor-col-resize hover:bg-accent bg-border/40 transition-colors mx-1 shrink-0 self-stretch rounded ${
          isResizing ? "bg-accent active" : ""
        }`}
      />

      {/* Control panel & seats */}
      <div 
        style={{ width: `${sidebarWidth}px` }}
        className="flex flex-col gap-4 bg-[#11131c]/40 border border-border/40 rounded-3xl p-5 shadow-lg backdrop-blur-md shrink-0 h-full overflow-y-auto"
      >
        {/* Seats */}
        <div>
          <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3 select-none">Seats</h4>
          <div className="space-y-2.5">
            {/* Red Player */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4.5 h-4.5 rounded-full bg-red-500 shadow-inner" />
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerRed ? getPeerName(playerRed) : "Vacant Seat"}
                </span>
              </div>
              {playerRed ? (
                playerRed === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("red")}>
                    Leave
                  </button>
                )
              ) : (
                !myColor && (
                  <button className="text-[10px] text-accent hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("red")}>
                    Sit Red
                  </button>
                )
              )}
            </div>

            {/* Green Player */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-border/20 bg-surface/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4.5 h-4.5 rounded-full bg-emerald-500 shadow-inner" />
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {playerGreen ? getPeerName(playerGreen) : "Vacant Seat"}
                </span>
              </div>
              {playerGreen ? (
                playerGreen === selfId && (
                  <button className="text-[10px] text-danger hover:underline font-bold" onClick={() => leaveRole("green")}>
                    Leave
                  </button>
                )
              ) : (
                !myColor && (
                  <button className="text-[10px] text-accent hover:underline font-extrabold uppercase tracking-wide" onClick={() => joinRole("green")}>
                    Sit Green
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Ludo Game Manual / Rules */}
        <div className="border-t border-border/20 pt-4 text-[10px] text-muted flex flex-col gap-2.5 leading-relaxed">
          <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1 select-none">How to Play</h4>
          <p>• Roll a <b>6</b> to deploy a token from home base to the track.</p>
          <p>• Move tokens forward along the track squares.</p>
          <p>• Land on an opponent's token to capture it and send it back home.</p>
          <p>• First to get all tokens to the goal wins.</p>
        </div>
      </div>
    </div>
  );
}
