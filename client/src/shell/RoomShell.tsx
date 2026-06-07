import { useState, useCallback } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { getAllModules } from "../core/moduleRegistry";
import type { ModuleEventEnvelope } from "../core/types";
import { Copy, Users, LogOut } from "lucide-react";

export default function RoomShell() {
  const { room, selfId, selfName, peers, leaveRoom, sendModuleEvent, onModuleEvent } = useWebRTC();
  const modules = getAllModules();
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const [showPeers, setShowPeers] = useState(false);

  const activeModule = modules.find((m) => m.id === activeModuleId);

  function copyRoomId() {
    if (room) navigator.clipboard.writeText(room.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sendForModule = useCallback(
    (event: string, payload: unknown, to?: string) => {
      sendModuleEvent(activeModuleId, event, payload, to);
    },
    [sendModuleEvent, activeModuleId]
  );

  const onForModule = useCallback(
    (handler: (env: ModuleEventEnvelope) => void) => {
      return onModuleEvent((env) => {
        if (env.moduleId === activeModuleId) handler(env);
      });
    },
    [onModuleEvent, activeModuleId]
  );

  if (!room) return null;

  const peerCount = peers.size;

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="text-lg font-bold text-accent mr-1">⬡</div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{room.name}</p>
          <p className="text-xs text-muted font-mono">{room.id}</p>
        </div>

        <button className="btn-ghost py-1 px-2 text-xs gap-1" onClick={copyRoomId}>
          {copied ? "✓ Copied" : <><Copy size={12} /> Share</>}
        </button>

        <button
          className="btn-ghost py-1 px-2 text-xs gap-1 relative"
          onClick={() => setShowPeers(!showPeers)}
        >
          <Users size={12} />
          <span>{peerCount + 1}</span>
          {/* Peer popover */}
          {showPeers && (
            <div className="absolute top-full right-0 mt-1 w-48 glass rounded-xl p-3 z-50 text-left" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-semibold text-muted mb-2">In room</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-white">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  {selfName} (you)
                </div>
                {Array.from(peers.values()).map((p) => (
                  <div key={p.peerId} className="flex items-center gap-2 text-xs text-white">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    {p.peerName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </button>

        <button className="btn-danger py-1 px-2" onClick={leaveRoom} title="Leave room">
          <LogOut size={14} />
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — module nav */}
        <nav className="flex flex-col items-center gap-1 px-1.5 py-3 border-r border-border bg-surface/40 w-16">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModuleId(m.id)}
              title={m.label}
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center text-xl transition-all ${
                m.id === activeModuleId
                  ? "bg-accent/20 border border-accent/40"
                  : "hover:bg-surface border border-transparent"
              }`}
            >
              {m.icon}
            </button>
          ))}
        </nav>

        {/* Module area */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {activeModule ? (
            <activeModule.component
              room={room}
              selfId={selfId}
              selfName={selfName}
              peers={peers}
              sendModuleEvent={sendForModule}
              onModuleEvent={onForModule}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              No module selected
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
