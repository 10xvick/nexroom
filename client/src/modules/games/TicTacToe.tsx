import { useEffect, useState } from "react";
import type { ModuleProps } from "../../core/types";

type Cell = "X" | "O" | null;

const WINS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board: Cell[]): Cell {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

interface TTTState {
  board: Cell[];
  xTurn: boolean;
  xId: string;
  oId: string;
}

export default function TicTacToe({ selfId, peers, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const peerList = Array.from(peers.values());
  const hasPeer = peerList.length > 0;

  const [state, setState] = useState<TTTState>({
    board: Array(9).fill(null),
    xTurn: true,
    xId: selfId,
    oId: peerList[0]?.peerId ?? "",
  });

  const myMark: Cell = state.xId === selfId ? "X" : state.oId === selfId ? "O" : null;
  const isMyTurn = (state.xTurn && myMark === "X") || (!state.xTurn && myMark === "O");
  const winner = checkWinner(state.board);
  const isDraw = !winner && state.board.every(Boolean);

  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "tictactoe") return;
      if (env.event === "state") setState(env.payload as TTTState);
    });
  }, [onModuleEvent]);

  function move(i: number) {
    if (!isMyTurn || state.board[i] || winner) return;
    const newBoard = [...state.board];
    newBoard[i] = myMark;
    const next: TTTState = { ...state, board: newBoard, xTurn: !state.xTurn };
    setState(next);
    sendModuleEvent("state", next);
  }

  function reset() {
    const next: TTTState = {
      board: Array(9).fill(null),
      xTurn: true,
      xId: selfId,
      oId: peerList[0]?.peerId ?? "",
    };
    setState(next);
    sendModuleEvent("state", next);
  }

  const cellClass = (i: number) => {
    const base = "w-full aspect-square flex items-center justify-center text-4xl font-bold rounded-xl border-2 transition-all cursor-pointer";
    const cell = state.board[i];
    return `${base} ${cell === "X" ? "border-accent text-accent" : cell === "O" ? "border-warn text-warn" : "border-border hover:border-muted"} ${!cell && isMyTurn && !winner ? "hover:bg-surface" : "cursor-default"}`;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
      {!hasPeer && (
        <p className="text-sm text-muted bg-surface/50 px-4 py-2 rounded-lg">Waiting for a peer to join…</p>
      )}

      <div className="text-center">
        {winner ? (
          <p className="text-lg font-semibold text-success">{winner === myMark ? "You win! 🎉" : "Opponent wins!"}</p>
        ) : isDraw ? (
          <p className="text-lg font-semibold text-muted">It's a draw!</p>
        ) : (
          <p className="text-sm text-muted">
            {isMyTurn ? <span className="text-white font-medium">Your turn</span> : "Opponent's turn…"}
            <span className="ml-2 text-xs">You are <span className={myMark === "X" ? "text-accent" : "text-warn"}>{myMark ?? "?"}</span></span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 w-64">
        {state.board.map((cell, i) => (
          <button key={i} className={cellClass(i)} onClick={() => move(i)}>
            {cell}
          </button>
        ))}
      </div>

      <button className="btn-ghost text-sm" onClick={reset}>New Game</button>
    </div>
  );
}
