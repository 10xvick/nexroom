import React from "react";
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

        {/* Board View */}
        <div className="w-full aspect-square border border-border/40 rounded-2xl bg-[#201F1D] p-3 flex flex-col items-center justify-center relative select-none">
          {/* Circular Grid Track */}
          <div className="grid grid-cols-10 grid-rows-10 w-full h-full gap-1 p-2 bg-black/40 rounded-xl">
            {/* Render Path squares */}
            {PATH_COORDS.map((cell, idx) => {
              // Find if any tokens are on this square
              const tokensOnSquare = Object.keys(positions).filter(
                (key) => positions[key] === idx
              );

              return (
                <div
                  key={idx}
                  style={{ gridRowStart: cell.r + 1, gridColumnStart: cell.c + 1 }}
                  className={`w-full h-full rounded border flex items-center justify-center gap-0.5 flex-wrap ${
                    idx < 10 ? "bg-red-950/40 border-red-500/20" : "bg-emerald-950/40 border-emerald-500/20"
                  }`}
                >
                  {tokensOnSquare.map((tok) => (
                    <button
                      key={tok}
                      onClick={() => moveToken(tok)}
                      disabled={!isMyTurn || !hasRolled || !tok.startsWith(turn)}
                      style={{ backgroundColor: tok.startsWith("red") ? COLORS.red : COLORS.green }}
                      className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-black cursor-pointer hover:scale-110 active:scale-90"
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Red Start Base */}
          <div className="absolute top-4 left-4 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-1.5">
            {Object.keys(positions)
              .filter((key) => key.startsWith("red") && positions[key] === -1)
              .map((tok) => (
                <button
                  key={tok}
                  onClick={() => moveToken(tok)}
                  disabled={!isMyTurn || !hasRolled || !tok.startsWith(turn)}
                  style={{ backgroundColor: COLORS.red }}
                  className="w-4 h-4 rounded-full border border-white hover:scale-110 active:scale-90 cursor-pointer"
                />
              ))}
          </div>

          {/* Green Start Base */}
          <div className="absolute bottom-4 right-4 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-1.5">
            {Object.keys(positions)
              .filter((key) => key.startsWith("green") && positions[key] === -1)
              .map((tok) => (
                <button
                  key={tok}
                  onClick={() => moveToken(tok)}
                  disabled={!isMyTurn || !hasRolled || !tok.startsWith(turn)}
                  style={{ backgroundColor: COLORS.green }}
                  className="w-4 h-4 rounded-full border border-white hover:scale-110 active:scale-90 cursor-pointer"
                />
              ))}
          </div>
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
