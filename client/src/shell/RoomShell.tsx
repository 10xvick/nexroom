import { useState, useCallback, useEffect } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { getAllModules } from "../core/moduleRegistry";
import type { ModuleEventEnvelope } from "../core/types";
import { Copy, Users, LogOut, Share2, Compass, CheckCircle2 } from "lucide-react";

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
  const selfAvatarChar = selfName ? selfName.charAt(0).toUpperCase() : "U";

  return (
    <div className="flex flex-col h-screen bg-bg relative overflow-hidden font-sans">
      {/* ── Background decorative glows ── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/4 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] rounded-full bg-purple-500/3 blur-[100px]" />
      </div>

      {/* ── Leave Room Modal ── */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="glass w-80 max-w-sm rounded-3xl p-6 border-white/5 shadow-[0_24px_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 text-center animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-white font-display">Disconnect Workspace</h3>
            <p className="text-xs text-muted leading-relaxed">Are you sure you want to end this peer-to-peer session?</p>
            <div className="flex gap-3 justify-center mt-2">
              <button 
                className="btn-ghost px-4 py-2 text-xs flex-1 rounded-xl" 
                onClick={() => setShowLeaveConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-danger px-4 py-2 text-xs flex-1 rounded-xl bg-danger hover:bg-danger/90 text-white border-none shadow-[0_4px_12px_rgba(239,68,68,0.2)]" 
                onClick={() => { setShowLeaveConfirm(false); leaveRoom(); }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Layout Workspace ── */}
      <div className="flex flex-1 min-h-0 z-10 relative">
        {/* Sidebar Nav (Native App Style) */}
        <nav className="flex flex-col justify-between items-center py-5 border-r border-border/80 bg-surface/30 w-20 z-20 shrink-0">
          <div className="flex flex-col items-center gap-6 w-full">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent to-purple-600 p-[1.5px] flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.25)] select-none">
              <div className="w-full h-full bg-[#0d0e12] rounded-[9px] flex items-center justify-center">
                <span className="text-accent-glow font-extrabold text-sm tracking-tight font-display">N</span>
              </div>
            </div>

            {/* Modules List */}
            <div className="flex flex-col items-center gap-2.5 w-full">
              {modules.map((m) => {
                const isActive = m.id === activeModuleId;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActiveModuleId(m.id)}
                    title={m.label}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group ${
                      isActive
                        ? "bg-accent/10 border border-accent/30 text-accent-glow sidebar-indicator"
                        : "hover:bg-surface-light/50 border border-transparent text-muted hover:text-white"
                    }`}
                  >
                    {m.icon}
                    {/* Hover tooltip */}
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-surface border border-border shadow-xl text-[10px] font-bold uppercase tracking-wider text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 shrink-0 whitespace-nowrap">
                      {m.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Profile Pill at Bottom of Sidebar */}
          <div className="flex flex-col items-center gap-4">
            <div 
              className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-accent/20 border border-accent/25 flex items-center justify-center text-xs font-bold text-accent-glow select-none"
              title={selfName}
            >
              {selfAvatarChar}
            </div>
          </div>
        </nav>

        {/* Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#07080c]">
          {/* Top Pill Header */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-surface/10 backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white font-display tracking-wide truncate">{room.name}</span>
                <span className="text-[10px] text-muted font-mono tracking-wider">{room.id}</span>
              </div>
            </div>

            {/* Action pill bar */}
            <div className="flex items-center gap-2">
              <button 
                className="btn-ghost py-1.5 px-3 rounded-lg text-xs gap-1.5 hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-all duration-300"
                onClick={copyRoomId}
              >
                {copied ? (
                  <><CheckCircle2 size={13} className="text-success" /> Copied</>
                ) : (
                  <><Share2 size={13} /> Invite</>
                )}
              </button>

              <div className="relative">
                <button
                  className={`btn-ghost py-1.5 px-3 rounded-lg text-xs gap-1.5 relative hover:bg-surface-light/50 transition-all duration-300 ${showPeers ? "bg-surface-light/70 text-white" : ""}`}
                  onClick={() => setShowPeers(!showPeers)}
                >
                  <Users size={13} />
                  <span>{peerCount + 1}</span>
                </button>
                
                {/* Peer list popover */}
                {showPeers && (
                  <div 
                    className="absolute top-full right-0 mt-2.5 w-56 glass rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)] border-white/5 z-50 text-left animate-in fade-in slide-in-from-top-2 duration-200" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">active users</p>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5 text-xs text-white">
                        <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="font-semibold truncate">{selfName} (you)</span>
                      </div>
                      {Array.from(peers.values()).map((p) => (
                        <div key={p.peerId} className="flex items-center gap-2.5 text-xs text-white">
                          <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                          <span className="truncate">{p.peerName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-4 w-[1px] bg-border/60 mx-1" />

              <button 
                className="btn-danger py-1.5 px-2.5 rounded-lg hover:bg-danger/20 transition-all duration-300"
                onClick={() => setShowLeaveConfirm(true)} 
                title="Disconnect Workspace"
              >
                <LogOut size={13} />
              </button>
            </div>
          </header>

          {/* Module Views */}
          <main className="flex-grow min-h-0 overflow-hidden relative">
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
    </div>
  );
}
