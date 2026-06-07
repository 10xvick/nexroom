import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ModuleProps } from "../../core/types";
import { Eraser, Pencil } from "lucide-react";

const WORDS = ["apple","banana","guitar","elephant","house","rocket","pizza","dragon","umbrella","castle","tornado","rainbow","telescope","kangaroo","volcano"];

type DrawEvent =
  | { type: "start"; x: number; y: number; color: string; size: number }
  | { type: "move"; x: number; y: number }
  | { type: "end" }
  | { type: "clear" }
  | { type: "word"; word: string; drawerId: string }
  | { type: "guess"; text: string; from: string; fromName: string };

export default function DrawGuess({ selfId, selfName, peers, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [word, setWord] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string>(selfId);
  const [guesses, setGuesses] = useState<{ text: string; from: string; fromName: string; correct: boolean }[]>([]);
  const [guessInput, setGuessInput] = useState("");
  const [color, setColor] = useState("#4f8ef7");
  const [size, setSize] = useState(4);
  const isDrawer = drawerId === selfId;

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  function startRound() {
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    setWord(w);
    setDrawerId(selfId);
    setGuesses([]);
    clearCanvas();
    sendModuleEvent("word", { type: "word", word: w, drawerId: selfId } as DrawEvent);
  }

  function clearCanvas() {
    const c = canvasRef.current;
    const g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
  }

  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "drawguess") return;
      const ev = env.payload as DrawEvent;
      const g = ctx();
      if (!g) return;

      if (ev.type === "start") {
        g.beginPath();
        g.strokeStyle = ev.color;
        g.lineWidth = ev.size;
        g.lineCap = "round";
        g.moveTo(ev.x, ev.y);
      } else if (ev.type === "move") {
        g.lineTo(ev.x, ev.y);
        g.stroke();
      } else if (ev.type === "end") {
        g.closePath();
      } else if (ev.type === "clear") {
        clearCanvas();
      } else if (ev.type === "word") {
        setWord(null); // guessers don't see the word
        setDrawerId(ev.drawerId);
        setGuesses([]);
        clearCanvas();
      } else if (ev.type === "guess") {
        const correct = word ? ev.text.toLowerCase().trim() === word.toLowerCase() : false;
        setGuesses((prev) => [...prev, { ...ev, correct }]);
      }
    });
  }, [onModuleEvent, word]);

  function getPos(e: MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: MouseEvent<HTMLCanvasElement>) {
    if (!isDrawer) return;
    const { x, y } = getPos(e);
    drawing.current = true;
    const g = ctx();
    if (!g) return;
    g.beginPath();
    g.strokeStyle = color;
    g.lineWidth = size;
    g.lineCap = "round";
    g.moveTo(x, y);
    sendModuleEvent("draw", { type: "start", x, y, color, size } as DrawEvent);
  }

  function onMouseMove(e: MouseEvent<HTMLCanvasElement>) {
    if (!isDrawer || !drawing.current) return;
    const { x, y } = getPos(e);
    const g = ctx();
    if (!g) return;
    g.lineTo(x, y);
    g.stroke();
    sendModuleEvent("draw", { type: "move", x, y } as DrawEvent);
  }

  function onMouseUp() {
    if (!isDrawer || !drawing.current) return;
    drawing.current = false;
    ctx()?.closePath();
    sendModuleEvent("draw", { type: "end" } as DrawEvent);
  }

  function onClear() {
    clearCanvas();
    sendModuleEvent("draw", { type: "clear" } as DrawEvent);
  }

  function submitGuess() {
    if (!guessInput.trim()) return;
    const correct = word ? guessInput.toLowerCase().trim() === word.toLowerCase() : false;
    const ev: DrawEvent = { type: "guess", text: guessInput.trim(), from: selfId, fromName: selfName };
    setGuesses((prev) => [...prev, { text: guessInput.trim(), from: selfId, fromName: selfName, correct }]);
    sendModuleEvent("draw", ev);
    setGuessInput("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        {isDrawer ? (
          <>
            <span className="text-sm text-muted">Drawing:</span>
            <span className="font-bold text-accent text-lg tracking-wider">{word ?? "—"}</span>
            <div className="flex-1" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
            <input type="range" min={1} max={20} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-20" />
            <button className="btn-ghost py-1 px-2" onClick={onClear}><Eraser size={14} /></button>
            <button className="btn-primary py-1 px-2 text-xs" onClick={startRound}>New Word</button>
          </>
        ) : (
          <>
            <Pencil size={14} className="text-muted" />
            <span className="text-sm text-muted">
              {Array.from(peers.values()).find((p) => p.peerId === drawerId)?.peerName ?? "Someone"} is drawing
            </span>
            <div className="flex-1" />
            {Array.from(peers.values()).length === 0 && (
              <button className="btn-primary py-1 px-3 text-xs" onClick={startRound}>Start</button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          className="flex-1 bg-white cursor-crosshair"
          style={{ touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {/* Guesses sidebar */}
        <div className="w-48 flex flex-col border-l border-border">
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {guesses.map((g, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${g.correct ? "bg-success/20 text-success" : "text-muted"}`}>
                <span className="font-medium">{g.fromName}: </span>{g.text}
                {g.correct && " ✓"}
              </div>
            ))}
          </div>
          {!isDrawer && (
            <div className="p-2 border-t border-border flex gap-1">
              <input
                type="text"
                className="flex-1 text-xs py-1 px-2"
                placeholder="Guess…"
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
