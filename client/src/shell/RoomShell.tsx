import { useState, useCallback, useEffect } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { getAllModules } from "../core/moduleRegistry";
import type { ModuleEventEnvelope } from "../core/types";
import { Copy, Users, LogOut, Share2, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function RoomShell() {
  const { room, selfId, selfName, peers, leaveRoom, sendModuleEvent, onModuleEvent } = useWebRTC();
  const modules = getAllModules();
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id ?? "");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPeers, setShowPeers] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave the room?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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
    <div className="flex flex-col h-screen bg-[#090a0f] relative overflow-hidden animate-fade-in">
      {/* Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-accent/5 rounded-full blur-[100px]" />
      </div>

      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="glass w-80 max-w-sm rounded-3xl p-6 border border-white/10 flex flex-col gap-4 text-center animate-scale-in">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-danger/10 text-danger mx-auto border border-danger/25">
              <LogOut size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Leave Workspace</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">Are you sure you want to disconnect? Any active file transfers or progress will be cancelled.</p>
            </div>
            <div className="flex gap-3 justify-center mt-2">
              <button className="btn-ghost px-5 py-2 text-xs flex-1 justify-center rounded-xl" onClick={() => setShowLeaveConfirm(false)}>
                Cancel
              </button>
              <button 
                className="btn bg-danger hover:bg-danger/80 text-white px-5 py-2 text-xs flex-1 justify-center rounded-xl" 
                onClick={() => { setShowLeaveConfirm(false); leaveRoom(); }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar / Header */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-border/50 bg-[#11131c]/60 backdrop-blur-md z-40 relative">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/10 border border-accent/30 text-accent font-extrabold shadow-[0_0_12px_rgba(79,142,247,0.15)] select-none">
          ⬡
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{room.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <p className="text-[10px] text-muted font-mono tracking-wider">ROOM CODE: {room.id}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button 
            className="btn-ghost py-2 px-3 text-xs gap-1.5 rounded-xl bg-surface/20 border-border/40 hover:bg-surface/60 transition-all"
            onClick={copyRoomId}
          >
            {copied ? (
              <><CheckCircle2 size={13} className="text-success" /> Copied</>
            ) : (
              <><Share2 size={13} /> Share Link</>
            )}
          </button>

          <button
            className="btn-ghost py-2 px-3 text-xs gap-1.5 relative rounded-xl bg-surface/20 border-border/40 hover:bg-surface/60 transition-all select-none"
            onClick={() => setShowPeers(!showPeers)}
          >
            <Users size={13} />
            <span className="font-bold">{peerCount + 1}</span>
            {/* Peer popover */}
            {showPeers && (
              <div 
                className="absolute top-full right-0 mt-2 w-56 glass rounded-2xl p-4 z-50 text-left border-border/80 shadow-2xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5">Connected Members</p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium truncate flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      {selfName}
                    </span>
                    <span className="text-[9px] bg-accent/10 border border-accent/25 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">You</span>
                  </div>
                  {Array.from(peers.values()).map((p) => (
                    <div key={p.peerId} className="flex items-center gap-1.5 text-xs text-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      <span className="truncate">{p.peerName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>

          <div className="h-6 w-[1px] bg-border/40 mx-1" />

          <button 
            className="btn-danger py-2 px-2.5 rounded-xl hover:bg-danger/20" 
            onClick={() => setShowLeaveConfirm(true)} 
            title="Leave workspace"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative z-30">
        {/* Sidebar Navigation */}
        <nav className="flex flex-col items-center gap-2.5 px-2 py-4 border-r border-border/50 bg-[#11131c]/30 w-18 z-40 select-none">
          {modules.map((m) => {
            const isActive = m.id === activeModuleId;
            return (
              <button
                key={m.id}
                onClick={() => setActiveModuleId(m.id)}
                title={m.label}
                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-xl transition-all duration-300 relative group ${
                  isActive
                    ? "bg-accent/15 border border-accent/40 text-accent shadow-[0_0_16px_rgba(79,142,247,0.1)]"
                    : "hover:bg-surface border border-transparent text-muted hover:text-white"
                }`}
              >
                {m.icon}
                
                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="absolute left-[-2px] top-1/2 -translate-y-1/2 w-1 h-4 bg-accent rounded-r-full" />
                )}
                
                {/* Floating tooltip */}
                <span className="absolute left-full ml-3 px-2.5 py-1 text-[10px] font-bold text-white bg-black/80 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md border border-white/5 whitespace-nowrap z-50">
                  {m.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Active Module Panel */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative bg-[#0d0f14]/80">
          {modules.map((m) => (
            <div
              key={m.id}
              className={`h-full w-full ${m.id === activeModuleId ? "block" : "hidden"}`}
            >
              <m.component
                room={room}
                selfId={selfId}
                selfName={selfName}
                peers={peers}
                sendModuleEvent={(event: string, payload: unknown, to?: string) => {
                  sendModuleEvent(m.id, event, payload, to);
                }}
                onModuleEvent={(handler: (env: ModuleEventEnvelope) => void) => {
                  return onModuleEvent((env) => {
                    if (env.moduleId === m.id) handler(env);
                  });
                }}
              />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
