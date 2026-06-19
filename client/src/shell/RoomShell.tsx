import { useState, useCallback, useEffect } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { getAllModules } from "../core/moduleRegistry";
import type { ModuleEventEnvelope } from "../core/types";
import { Copy, Users, LogOut, MessageSquare } from "lucide-react";
import ChatModule from "../modules/chat/ChatModule";

export default function RoomShell() {
  const { room, selfId, selfName, peers, leaveRoom, sendModuleEvent, onModuleEvent } = useWebRTC();
  const modules = getAllModules();
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id ?? "");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPeers, setShowPeers] = useState(false);

  // Universal Side Chat Layout State
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isResizing, setIsResizing] = useState(false);

  // Global Reactions State
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  // Custom reactions lists
  const ALL_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍", "🎉", "👏", "🚀", "💡", "💯", "👀", "🥳", "✨", "💩", "😭", "💔", "🤔", "👑", "🍕"];
  const ALL_STICKERS = ["🐱", "🐶", "🦊", "🦁", "🐸", "🐵", "🐼", "🐻", "🐨", "🐯", "🐰", "🐧", "🦄", "🐉", "🐙", "🦋", "🌸", "🍔", "🍦", "🛸"];
  const DEFAULT_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍", "🎉", "👏", "🚀", "💡", "💯", "👀"];
  const DEFAULT_STICKERS = ["🐱", "🐶", "🦊", "🦁", "🐸", "🐵"];

  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(() => {
    const saved = localStorage.getItem("nexroom_selected_emojis");
    return saved ? JSON.parse(saved) : DEFAULT_EMOJIS;
  });
  const [selectedStickers, setSelectedStickers] = useState<string[]>(() => {
    const saved = localStorage.getItem("nexroom_selected_stickers");
    return saved ? JSON.parse(saved) : DEFAULT_STICKERS;
  });
  const [showCustomizePopover, setShowCustomizePopover] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const spawnReaction = useCallback((emoji: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const x = Math.floor(Math.random() * 80) + 10;
    setReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 4000);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    sendModuleEvent("system", "reaction", { emoji });
    spawnReaction(emoji);
  }, [sendModuleEvent, spawnReaction]);

  useEffect(() => {
    localStorage.setItem("nexroom_selected_emojis", JSON.stringify(selectedEmojis));
  }, [selectedEmojis]);

  useEffect(() => {
    localStorage.setItem("nexroom_selected_stickers", JSON.stringify(selectedStickers));
  }, [selectedStickers]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 16;
      if (newWidth > 240 && newWidth < 600) {
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

  // Listen for global reactions
  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId === "system" && env.event === "reaction") {
        const payload = env.payload as any;
        if (payload && payload.emoji) {
          spawnReaction(payload.emoji);
        }
      }
    });
  }, [onModuleEvent, spawnReaction]);

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
    <div className="flex flex-col h-screen bg-bg">
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass w-80 max-w-sm rounded-2xl p-6 border border-border flex flex-col gap-4 text-center">
            <h3 className="text-lg font-bold text-white">Are you sure?</h3>
            <p className="text-sm text-muted">Do you really want to leave this session?</p>
            <div className="flex gap-3 justify-center mt-2">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowLeaveConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger px-4 py-2 text-sm" onClick={() => { setShowLeaveConfirm(false); leaveRoom(); }}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="text-lg font-bold text-accent mr-1">⬡</div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{room.name}</p>
          <p className="text-xs text-muted font-mono">Room Code: {room.id}</p>
        </div>

        <button className="btn-ghost py-1.5 px-2.5 text-xs gap-1" onClick={copyRoomId}>
          {copied ? "✓ Copied" : <><Copy size={12} /> Share</>}
        </button>

        <button
          className="btn-ghost py-1.5 px-2.5 text-xs gap-1 relative"
          onClick={() => setShowPeers(!showPeers)}
        >
          <Users size={12} />
          <span>{peerCount + 1}</span>
          {/* Peer popover */}
          {showPeers && (
            <div className="absolute top-full right-0 mt-1.5 w-48 glass rounded-xl p-3 z-50 text-left" onClick={(e) => e.stopPropagation()}>
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

        <button
          className={`btn-ghost py-1.5 px-2.5 text-xs gap-1 ${isChatOpen ? "bg-accent/20 border border-accent/40 text-accent" : ""}`}
          onClick={() => setIsChatOpen(!isChatOpen)}
          title="Toggle chat panel"
        >
          <MessageSquare size={12} />
          <span>Chat</span>
        </button>

        <button className="btn-danger py-1 px-2.5" onClick={() => setShowLeaveConfirm(true)} title="Leave room">
          <LogOut size={14} />
        </button>
      </header>

      {/* Main Container */}
      <div className={`flex flex-1 min-h-0 ${isResizing ? "select-none" : ""}`}>
        {/* Sidebar — module nav */}
        <nav className="flex flex-col items-center gap-1.5 px-1.5 py-3 border-r border-border bg-surface/40 w-16">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModuleId(m.id)}
              title={m.label}
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center text-xl transition-all ${m.id === activeModuleId
                ? "bg-accent/20 border border-accent/40 text-accent"
                : "hover:bg-surface border border-transparent text-muted hover:text-white"
                }`}
            >
              {m.icon}
            </button>
          ))}
        </nav>

        {/* Module area */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative">
          <div className="flex-1 min-h-0 relative">
            {modules.map((m) => {
              if (m.id !== activeModuleId) return null;
              return (
                <div
                  key={m.id}
                  className="h-full w-full"
                >
                  <m.component
                    room={room}
                    selfId={selfId}
                    selfName={selfName}
                    peers={peers}
                    isActive={true}
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
              );
            })}
          </div>

          {/* Quick Reaction Tab Bottom Panel */}
          <div className="p-3 border-t border-border bg-surface/30 flex items-center justify-between gap-4 relative shrink-0">
            {/* Emojis Row */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none flex-1">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider shrink-0 mr-1">React:</span>
              {selectedEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="hover:scale-125 active:scale-90 transition-transform text-xl p-1 hover:bg-border/60 rounded-lg shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Stickers Row & Customize */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider shrink-0 mr-1">Stickers:</span>
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none max-w-[200px]">
                {selectedStickers.map((sticker) => (
                  <button
                    key={sticker}
                    onClick={() => sendReaction(sticker)}
                    className="hover:scale-110 active:scale-90 transition-transform text-3xl p-1 hover:bg-border/60 rounded-xl shrink-0"
                  >
                    {sticker}
                  </button>
                ))}
              </div>

              {/* Customize Button */}
              <button
                onClick={() => setShowCustomizePopover(!showCustomizePopover)}
                className="p-1.5 hover:bg-border/60 text-muted hover:text-white rounded-lg flex items-center justify-center gap-0.5 border border-border/20 ml-2"
                title="Customize panel"
              >
                <span className="text-[11px] font-bold">⚙️ Custom</span>
              </button>
            </div>

            {/* Customize Popover Menu positioned relative to bottom-right of tab area */}
            {showCustomizePopover && (
              <div className="absolute bottom-full right-3 mb-2 w-72 max-h-[300px] overflow-y-auto glass rounded-xl border border-border p-3 z-[110] flex flex-col gap-3 shadow-xl text-left">
                <div className="flex justify-between items-center border-b border-border/40 pb-2">
                  <span className="text-xs font-bold text-white">Quick Reactions Settings</span>
                  <button
                    onClick={() => setShowCustomizePopover(false)}
                    className="text-xs text-muted hover:text-white"
                  >
                    Close
                  </button>
                </div>

                {/* Emojis Selector */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Select Emojis</span>
                  <div className="grid grid-cols-6 gap-1">
                    {ALL_EMOJIS.map((emoji) => {
                      const isSelected = selectedEmojis.includes(emoji);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            setSelectedEmojis((prev) =>
                              isSelected ? prev.filter((e) => e !== emoji) : [...prev, emoji]
                            );
                          }}
                          className={`text-lg p-1 rounded-lg border transition-all ${isSelected
                            ? "bg-accent/20 border-accent text-accent scale-105"
                            : "border-transparent hover:bg-surface/50"
                            }`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stickers Selector */}
                <div className="space-y-1.5 border-t border-border/40 pt-2">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Select Stickers</span>
                  <div className="grid grid-cols-6 gap-1">
                    {ALL_STICKERS.map((sticker) => {
                      const isSelected = selectedStickers.includes(sticker);
                      return (
                        <button
                          key={sticker}
                          onClick={() => {
                            setSelectedStickers((prev) =>
                              isSelected ? prev.filter((s) => s !== sticker) : [...prev, sticker]
                            );
                          }}
                          className={`text-2xl p-1 rounded-lg border transition-all ${isSelected
                            ? "bg-accent/20 border-accent scale-105"
                            : "border-transparent hover:bg-surface/50"
                            }`}
                        >
                          {sticker}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Resize Handle Divider */}
        {isChatOpen && (
          <div
            onMouseDown={startResize}
            className={`w-[4px] cursor-col-resize hover:bg-accent bg-border/40 transition-colors mx-1 shrink-0 self-stretch rounded ${isResizing ? "bg-accent active" : ""
              }`}
          />
        )}

        {/* Universal Chat Sidebar */}
        {isChatOpen && (
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex flex-col bg-surface/20 border-l border-border h-full shrink-0"
          >
            <div className="px-4 py-3 border-b border-border bg-surface/40 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Room Chat</h3>
            </div>
            <div className="flex-1 min-h-0">
              <ChatModule
                room={room}
                selfId={selfId}
                selfName={selfName}
                peers={peers}
                isActive={isChatOpen}
                sendModuleEvent={(event: string, payload: unknown, to?: string) => {
                  sendModuleEvent("chat", event, payload, to);
                }}
                onModuleEvent={(handler: (env: ModuleEventEnvelope) => void) => {
                  return onModuleEvent((env) => {
                    if (env.moduleId === "chat") handler(env);
                  });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Floating Reactions Overlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[120]">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="global-floating-reaction"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Global Reactions CSS styles */}
      <style>{`
@keyframes floatUpGlobal {
  0% {
    transform: translateY(0vh) scale(0.5);
    opacity: 1;
  }
  50% {
    transform: translateY(-30vh) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-100vh) scale(2);
    opacity: 0;
  }
}

.global-floating-reaction {
  position: absolute;
  bottom: -50px;        /* start slightly below the container */
  font-size: 4rem;
  animation: floatUpGlobal 2s ease-in-out forwards; /* added forwards */
  pointer-events: none;
  will-change: transform, opacity; /* performance hint */
}
      `}</style>

      {/* Footer */}
      <footer className="px-4 py-1.5 border-t border-border bg-surface/30 flex items-center justify-between text-[10px] text-muted select-none">
        <span>Direct P2P Room Connection</span>
        <span>Version 1.2.0</span>
      </footer>
    </div>
  );
}
