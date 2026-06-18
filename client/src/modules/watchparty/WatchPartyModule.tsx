import { useEffect, useRef, useState, useCallback } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Play, Pause, Link, Users, Maximize } from "lucide-react";
import ChatModule from "../chat/ChatModule";

type WPEvent =
  | { type: "load"; url: string }
  | { type: "play"; time: number }
  | { type: "pause"; time: number }
  | { type: "seek"; time: number };

interface WatchPartyState {
  videoUrl: string;
  videoId: string | null;
  isPlaying: boolean;
  time: number;
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatTime(secs: number) {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function WatchPartyModule({ selfId, selfName, peers, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState, onModuleEvent: rawOnModuleEvent, sendModuleEvent: rawSendModuleEvent, room } = useWebRTC();
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

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

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suppressSync = useRef(false);
  const lastTimeRef = useRef(0);
  const playerReadyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const isDragging = useRef(false);

  const sendForChat = useCallback(
    (event: string, payload: unknown, to?: string) => {
      rawSendModuleEvent("chat", event, payload, to);
    },
    [rawSendModuleEvent]
  );

  const onForChat = useCallback(
    (handler: (env: any) => void) => {
      return rawOnModuleEvent((env) => {
        if (env.moduleId === "chat") handler(env);
      });
    },
    [rawOnModuleEvent]
  );

  const spawnReaction = useCallback((emoji: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const x = Math.floor(Math.random() * 80) + 10;
    setReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 4000);
  }, []);

  function sendReaction(emoji: string) {
    sendModuleEvent("reaction", { type: "reaction", emoji });
    spawnReaction(emoji);
  }

  // ── YouTube IFrame API Loader & Player Initialization ──────────────────────
  useEffect(() => {
    // Load YouTube Iframe API if not already loaded
    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    let player: any = null;

    const initPlayer = () => {
      if (!videoId) return;
      if (!(window as any).YT || !(window as any).YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      // Reuse existing player if available
      if (playerRef.current) {
        try {
          playerRef.current.loadVideoById({
            videoId: videoId,
            startSeconds: 0
          });
          playerReadyRef.current = true;
          return;
        } catch (e) {
          console.error("Error loading video ID on player reuse:", e);
        }
      }

      // Instantiate the YT.Player widget
      player = new (window as any).YT.Player("watch-party-player", {
        height: "100%",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            playerReadyRef.current = true;
            setDuration(event.target.getDuration());
            if (pendingSeekRef.current !== null) {
              event.target.seekTo(pendingSeekRef.current, true);
              pendingSeekRef.current = null;
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            // 1 = PLAYING, 2 = PAUSED
            if (state === 1) {
              setIsPlaying(true);
            } else if (state === 2) {
              setIsPlaying(false);
            }
          }
        }
      });
      playerRef.current = player;
    };

    initPlayer();
  }, [videoId]);

  // Clean up player instance on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, []);

  // ── Poll playback time from YouTube Player ─────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        if (!isDragging.current && playerRef.current && playerRef.current.getCurrentTime) {
          try {
            const time = playerRef.current.getCurrentTime();
            if (typeof time === "number") {
              lastTimeRef.current = time;
              setCurrentTime(time);
            }
          } catch (_) { }
        }
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── Periodic state synchronization ──────────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && videoId) {
      interval = setInterval(() => {
        savePartyState({ time: lastTimeRef.current, isPlaying: true }, false);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, videoId, videoUrl]);

  useEffect(() => {
    // Load initial state if cached
    const cached = getModuleState("watchparty") as WatchPartyState;
    if (cached) {
      setVideoUrl(cached.videoUrl);
      setVideoId(cached.videoId);
      setIsPlaying(cached.isPlaying);
      if (cached.time > 0) {
        pendingSeekRef.current = cached.time;
      }
    }

    // Sync state on load
    syncModuleState("watchparty");

    return onModuleEvent((env) => {
      if (env.moduleId !== "watchparty") return;

      if (env.event === "state:sync") {
        const state = env.payload as WatchPartyState;
        suppressSync.current = true;
        setVideoUrl(state.videoUrl);
        setVideoId(state.videoId);
        setIsPlaying(state.isPlaying);

        if (state.isPlaying) {
          sendPlayerCommand("playVideo");
        } else {
          sendPlayerCommand("pauseVideo");
        }

        const timeDiff = Math.abs(lastTimeRef.current - state.time);
        if (timeDiff > 2) {
          if (playerReadyRef.current) {
            sendPlayerCommand("seekTo", state.time, true);
          } else {
            pendingSeekRef.current = state.time;
          }
        }

        setTimeout(() => { suppressSync.current = false; }, 300);
        return;
      }

      if (env.from === selfId) return;

      const ev = env.payload as any;
      suppressSync.current = true;

      if (ev.type === "reaction") {
        spawnReaction(ev.emoji);
        suppressSync.current = false;
        return;
      }

      if (ev.type === "load") {
        setVideoUrl(ev.url);
        setVideoId(extractVideoId(ev.url));
        playerReadyRef.current = false;
        setDuration(0);
        setCurrentTime(0);
        lastTimeRef.current = 0;
      } else if (ev.type === "play") {
        setIsPlaying(true);
        sendPlayerCommand("playVideo");
        if (ev.time >= 0) {
          setCurrentTime(ev.time);
          lastTimeRef.current = ev.time;
          if (playerReadyRef.current) sendPlayerCommand("seekTo", ev.time, true);
          else pendingSeekRef.current = ev.time;
        }
      } else if (ev.type === "pause") {
        setIsPlaying(false);
        sendPlayerCommand("pauseVideo");
        if (ev.time >= 0) {
          setCurrentTime(ev.time);
          lastTimeRef.current = ev.time;
          if (playerReadyRef.current) sendPlayerCommand("seekTo", ev.time, true);
          else pendingSeekRef.current = ev.time;
        }
      } else if (ev.type === "seek") {
        setCurrentTime(ev.time);
        lastTimeRef.current = ev.time;
        if (playerReadyRef.current) sendPlayerCommand("seekTo", ev.time, true);
        else pendingSeekRef.current = ev.time;
      }

      setTimeout(() => { suppressSync.current = false; }, 300);
    });
  }, [onModuleEvent, selfId, getModuleState, syncModuleState]);

  function sendPlayerCommand(func: string, ...args: any[]) {
    const player = playerRef.current;
    if (!player || !playerReadyRef.current) return;
    try {
      if (func === "playVideo") {
        player.playVideo();
      } else if (func === "pauseVideo") {
        player.pauseVideo();
      } else if (func === "seekTo") {
        player.seekTo(args[0], args[1] ?? true);
      }
    } catch (e) {
      console.error("Player command failed:", e);
    }
  }

  function savePartyState(override: Partial<WatchPartyState> = {}, broadcast = true) {
    const current: WatchPartyState = {
      videoUrl,
      videoId,
      isPlaying,
      time: lastTimeRef.current,
      ...override,
    };
    setModuleState("watchparty", current, broadcast);
  }

  function loadVideo() {
    const id = extractVideoId(inputUrl);
    if (!id) return;
    setVideoId(id);
    setVideoUrl(inputUrl);
    playerReadyRef.current = false;
    setDuration(0);
    setCurrentTime(0);
    if (!suppressSync.current) {
      sendModuleEvent("load", { type: "load", url: inputUrl } as WPEvent);
      savePartyState({ videoUrl: inputUrl, videoId: id, isPlaying: false, time: 0 });
    }
    setInputUrl("");
  }

  function play() {
    setIsPlaying(true);
    sendPlayerCommand("playVideo");
    if (!suppressSync.current) {
      sendModuleEvent("play", { type: "play", time: lastTimeRef.current } as WPEvent);
      savePartyState({ isPlaying: true, time: lastTimeRef.current });
    }
  }

  function pause() {
    setIsPlaying(false);
    sendPlayerCommand("pauseVideo");
    if (!suppressSync.current) {
      sendModuleEvent("pause", { type: "pause", time: lastTimeRef.current } as WPEvent);
      savePartyState({ isPlaying: false, time: lastTimeRef.current });
    }
  }

  function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    isDragging.current = true;
    setCurrentTime(parseFloat(e.target.value));
  }

  function handleSeekRelease() {
    isDragging.current = false;
    lastTimeRef.current = currentTime;
    sendPlayerCommand("seekTo", currentTime, true);
    if (!suppressSync.current) {
      sendModuleEvent("seek", { type: "seek", time: currentTime } as WPEvent);
      savePartyState({ time: currentTime });
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <div className={`flex h-full p-4 overflow-hidden gap-1 ${isResizing ? "select-none" : ""}`}>
      <style>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translateY(-10vh) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: translateY(-50vh) scale(0.8);
            opacity: 0;
          }
        }
        .floating-reaction {
          position: absolute;
          bottom: 20px;
          font-size: 3.5rem;
          animation: floatUp 4s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
          pointer-events: none;
          z-index: 50;
        }
      `}</style>

      {/* Left side: Video Player and Media controls */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-3">
        {/* URL input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="url"
              className="w-full pl-8"
              placeholder="Paste YouTube URL…"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadVideo()}
            />
          </div>
          <button className="btn-primary" onClick={loadVideo}>Load</button>
        </div>

        {/* Player Container */}
        {videoId ? (
          <div className="flex flex-col gap-3 min-h-0">
            <div
              ref={containerRef}
              className="relative w-full rounded-xl overflow-hidden bg-black max-h-[60vh] max-w-[100vw] mx-auto aspect-video"
            >
              <div
                id="watch-party-player"
                className="absolute inset-0 w-full h-full border-none pointer-events-none"
              />

              {/* Floating Reactions Overlay */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {reactions.map((r) => (
                  <span
                    key={r.id}
                    className="floating-reaction"
                    style={{ left: `${r.x}%` }}
                  >
                    {r.emoji}
                  </span>
                ))}
              </div>
            </div>

            {/* Custom Media Controls Card */}
            <div className="flex flex-col gap-2.5 bg-surface/40 border border-border rounded-xl p-3">
              {/* Seek bar and time display */}
              <div className="flex items-center gap-3 w-full">
                <span className="text-xs font-mono text-muted">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekRelease}
                  onTouchEnd={handleSeekRelease}
                  className="flex-1 h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-xs font-mono text-muted">{formatTime(duration)}</span>
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <button
                  className={`btn py-1.5 px-3 justify-center gap-1.5 ${isPlaying ? "btn-ghost" : "btn-primary"}`}
                  onClick={isPlaying ? pause : play}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? "Pause for all" : "Play for all"}
                </button>
                <button className="btn-ghost gap-1.5 text-xs py-1.5 px-3" onClick={toggleFullscreen}>
                  <Maximize size={14} /> Fullscreen
                </button>
                <div className="flex items-center gap-1 text-xs text-muted ml-auto">
                  <Users size={12} />
                  <span>Controls sync to all peers</span>
                </div>
              </div>

              {/* Reaction Bar */}
              <div className="flex items-center gap-2 border-t border-border/40 pt-2.5 mt-1">
                <span className="text-xs text-muted font-medium mr-1">React:</span>
                {["❤️", "😂", "😮", "😢", "🔥", "👍", "🎉", "👏", "🚀", "💡", "💯", "👀"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="hover:scale-125 active:scale-90 transition-transform text-lg p-1 bg-surface hover:bg-border rounded-lg border border-border/40"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border text-muted py-12 px-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Play size={40} className="opacity-35 text-accent animate-pulse" />
              <p className="text-sm font-semibold text-white">Paste a YouTube URL above to start a watch party</p>
              <p className="text-xs opacity-60">Play/pause/seek syncs to all peers in the room</p>
            </div>
            
            <div className="w-full max-w-md border-t border-border/40 pt-6 flex flex-col gap-3">
              <p className="text-xs font-bold text-muted uppercase tracking-wider text-center mb-1">
                Or pick a quick recommendation:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { title: "🎵 Lofi Hip Hop Radio (Lofi Girl)", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
                  { title: "🐰 Big Buck Bunny (Open Movie)", url: "https://www.youtube.com/watch?v=aqz-KE-BPKQ" },
                  { title: "🚀 NASA ISS Space Station Live Stream", url: "https://www.youtube.com/watch?v=x7WZzEaFk6s" },
                  { title: "🌊 Relaxing Ocean Waves (4K)", url: "https://www.youtube.com/watch?v=S15C421p9gM" }
                ].map((rec) => (
                  <button
                    key={rec.url}
                    onClick={() => {
                      setInputUrl(rec.url);
                      const id = extractVideoId(rec.url);
                      if (id) {
                        setVideoId(id);
                        setVideoUrl(rec.url);
                        playerReadyRef.current = false;
                        setDuration(0);
                        setCurrentTime(0);
                        sendModuleEvent("load", { type: "load", url: rec.url } as WPEvent);
                        savePartyState({ videoUrl: rec.url, videoId: id, isPlaying: false, time: 0 });
                      }
                    }}
                    className="w-full text-left text-xs bg-surface/30 hover:bg-surface border border-border/40 hover:border-accent/50 rounded-xl px-4 py-2.5 transition-all text-white font-medium hover:scale-[1.01]"
                  >
                    {rec.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle Divider */}
      <div 
        onMouseDown={startResize}
        className={`w-[4px] cursor-col-resize hover:bg-accent bg-border/40 transition-colors mx-1 shrink-0 self-stretch rounded ${
          isResizing ? "bg-accent active" : ""
        }`}
      />

      {/* Right side: Reused Chat Panel */}
      <div 
        style={{ width: `${sidebarWidth}px` }} 
        className="flex flex-col bg-surface/20 border border-border rounded-xl overflow-hidden h-full shrink-0"
      >
        <div className="px-4 py-3 border-b border-border bg-surface/40">
          <h3 className="text-sm font-semibold text-white">Watch Party Chat</h3>
        </div>
        <div className="flex-1 min-h-0">
          <ChatModule
            room={room!}
            selfId={selfId}
            selfName={selfName}
            peers={peers}
            sendModuleEvent={sendForChat}
            onModuleEvent={onForChat}
          />
        </div>
      </div>
    </div>
  );
}
