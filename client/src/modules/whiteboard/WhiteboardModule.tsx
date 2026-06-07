import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ModuleProps } from "../../core/types";
import { Eraser, Minus, Plus, Trash2 } from "lucide-react";

type WBEvent =
  | { type: "start"; x: number; y: number; color: string; size: number }
  | { type: "move"; x: number; y: number }
  | { type: "end" }
  | { type: "clear" };

const COLORS = ["#ffffff", "#4f8ef7", "#22c55e", "#ef4444", "#f59e0b", "#a855f7", "#ec4899", "#000000"];

export default function WhiteboardModule({ sendModuleEvent, onModuleEvent }: ModuleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(3);
  const [eraser, setEraser] = useState(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#1a1f2e";
    g.fillRect(0, 0, c.width, c.height);
  }, []);

  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "whiteboard") return;
      const ev = env.payload as WBEvent;
      const g = ctx();
      if (!g) return;

      if (ev.type === "start") {
        g.beginPath();
        g.strokeStyle = ev.color;
        g.lineWidth = ev.size;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.moveTo(ev.x, ev.y);
      } else if (ev.type === "move") {
        g.lineTo(ev.x, ev.y);
        g.stroke();
      } else if (ev.type === "end") {
        g.closePath();
      } else if (ev.type === "clear") {
        const c = canvasRef.current!;
        g.fillStyle = "#1a1f2e";
        g.fillRect(0, 0, c.width, c.height);
      }
    });
  }, [onModuleEvent]);

  function getPos(e: MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function activeColor() {
    return eraser ? "#1a1f2e" : color;
  }

  function onMouseDown(e: MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getPos(e);
    drawing.current = true;
    const g = ctx();
    if (!g) return;
    const c = activeColor();
    const s = eraser ? size * 4 : size;
    g.beginPath();
    g.strokeStyle = c;
    g.lineWidth = s;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.moveTo(x, y);
    sendModuleEvent("stroke", { type: "start", x, y, color: c, size: s } as WBEvent);
  }

  function onMouseMove(e: MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const { x, y } = getPos(e);
    const g = ctx();
    if (!g) return;
    g.lineTo(x, y);
    g.stroke();
    sendModuleEvent("stroke", { type: "move", x, y } as WBEvent);
  }

  function onMouseUp() {
    if (!drawing.current) return;
    drawing.current = false;
    ctx()?.closePath();
    sendModuleEvent("stroke", { type: "end" } as WBEvent);
  }

  function clear() {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g) return;
    g.fillStyle = "#1a1f2e";
    g.fillRect(0, 0, c.width, c.height);
    sendModuleEvent("stroke", { type: "clear" } as WBEvent);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface/50 flex-wrap">
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setEraser(false); }}
              className={`w-6 h-6 rounded-full border-2 transition-all ${color === c && !eraser ? "border-white scale-110" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <button className={`btn py-1 px-2 ${eraser ? "btn-primary" : "btn-ghost"}`} onClick={() => setEraser(!eraser)}>
          <Eraser size={14} />
        </button>
        <div className="flex items-center gap-1">
          <button className="btn-ghost py-1 px-1" onClick={() => setSize((s) => Math.max(1, s - 1))}><Minus size={12} /></button>
          <span className="text-xs text-muted w-4 text-center">{size}</span>
          <button className="btn-ghost py-1 px-1" onClick={() => setSize((s) => Math.min(30, s + 1))}><Plus size={12} /></button>
        </div>
        <div className="flex-1" />
        <button className="btn-danger py-1 px-2" onClick={clear}><Trash2 size={14} /></button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className="flex-1 w-full cursor-crosshair"
        style={{ touchAction: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </div>
  );
}
