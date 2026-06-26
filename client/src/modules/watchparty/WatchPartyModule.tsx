import { useEffect, useRef, useState, useCallback } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Play, Pause, Users, Maximize } from "lucide-react";

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

export default function WatchPartyModule({ selfId, selfName, peers, sendModuleEvent, onModuleEvent, isActive }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState, onModuleEvent: rawOnModuleEvent, sendModuleEvent: rawSendModuleEvent, room } = useWebRTC();
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const suppressSync = useRef(false);
  const lastTimeRef = useRef(0);
  const playerReadyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const isDragging = useRef(false);

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

      if (ev.type === "load") {
        if (!ev.url) {
          setVideoId(null);
          setVideoUrl("");
          setCurrentTime(0);
          setDuration(0);
          lastTimeRef.current = 0;
          if (playerRef.current && playerRef.current.destroy) {
            playerRef.current.destroy();
            playerRef.current = null;
            playerReadyRef.current = false;
          }
        } else {
          setVideoUrl(ev.url);
          setVideoId(extractVideoId(ev.url));
          playerReadyRef.current = false;
          setDuration(0);
          setCurrentTime(0);
          lastTimeRef.current = 0;
        }
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

  const defaultTrending = [
    { title: "Lofi Hip Hop Radio - Beats to Relax/Study to", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", id: "jfKfPfyJRdk" },
    { title: "NASA Live: Official ISS Space Station Stream - Earth Views from Orbit", url: "https://www.youtube.com/watch?v=x7WZzEaFk6s", id: "x7WZzEaFk6s" },
    { title: "Marvel Studios' Avengers: Doomsday - Hall H Presentation Teaser", url: "https://www.youtube.com/watch?v=hA6hldpSTF8", id: "hA6hldpSTF8" },
    { title: "Stunning 4K Nature Video: Relaxation Music with Birds Chirping", url: "https://www.youtube.com/watch?v=6jy0RpqJtJ4", id: "6jy0RpqJtJ4" },
    { title: "Why WebRTC is Hard - A Technical Deep Dive", url: "https://www.youtube.com/watch?v=EsLookwz-P8", id: "EsLookwz-P8" },
    { title: "MKBHD - Apple Vision Pro Review: The Apple Ecosystem", url: "https://www.youtube.com/watch?v=UvkgmyfQ33o", id: "UvkgmyfQ33o" },
    { title: "How I Built a Serverless App in 2026", url: "https://www.youtube.com/watch?v=T3yZkS_c98I", id: "T3yZkS_c98I" },
    { title: "Interstellar - No Time For Caution (Docking Scene OST 4K)", url: "https://www.youtube.com/watch?v=m3zvVGJRtDk", id: "m3zvVGJRtDk" }
  ];

  const [trendingVideos, setTrendingVideos] = useState<any[]>(defaultTrending);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);

  const scrollLeft = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: -240, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 240, behavior: "smooth" });
    }
  };

  // Fetch trending videos on mount
  useEffect(() => {
    let active = true;
    async function fetchTrending() {
      setIsLoadingTrending(true);
      const instances = [
        "https://invidious.flokinet.to",
        "https://invidious.nerdvpn.de",
        "https://inv.vern.cc",
        "https://invidious.privacydev.net",
        "https://iv.ggtyler.dev",
        "https://vid.puffyan.us",
        "https://yewtu.be"
      ];

      for (const instance of instances) {
        if (!active) return;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          
          const res = await fetch(`${instance}/api/v1/trending`, { 
            signal: controller.signal 
          });
          clearTimeout(timeoutId);

          if (!res.ok) continue;
          const data = await res.json();
          if (active && Array.isArray(data) && data.length >= 4) {
            const formatted = data.map((v: any) => {
              const id = v.videoId || v.id || "";
              return {
                title: v.title || "Trending Video",
                channel: (v.author || v.channelTitle || "").toLowerCase(),
                description: (v.description || "").toLowerCase(),
                url: `https://www.youtube.com/watch?v=${id}`,
                id: id
              };
            }).filter(v => {
              if (!v.id) return false;
              const ch = v.channel || "";
              const title = (v.title || "").toLowerCase();
              if (ch.includes("vevo") || ch.includes("topic")) return false;
              if (title.includes("music video") || title.includes("official mv")) return false;
              return true;
            });

            if (formatted.length >= 4) {
              setTrendingVideos(formatted.slice(0, 12));
              setIsLoadingTrending(false);
              return;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch trending from ${instance}:`, err);
        }
      }
      if (active) {
        setIsLoadingTrending(false);
      }
    }
    fetchTrending();
    return () => {
      active = false;
    };
  }, []);

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

  function removeVideo() {
    setVideoId(null);
    setVideoUrl("");
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    lastTimeRef.current = 0;
    if (playerRef.current && playerRef.current.destroy) {
      try {
        playerRef.current.destroy();
      } catch (_) { }
      playerRef.current = null;
      playerReadyRef.current = false;
    }
    if (!suppressSync.current) {
      sendModuleEvent("load", { type: "load", url: "" } as WPEvent);
      savePartyState({ videoUrl: "", videoId: null, isPlaying: false, time: 0 });
    }
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
    <div className="flex h-full p-4 overflow-hidden gap-1">
      {/* Left side: Video Player and Media controls */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-3">
        {/* URL input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              className="w-full"
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
              className="relative w-full rounded-xl overflow-hidden bg-black max-h-[60vh] max-w-[100vw] mx-auto aspect-video border border-border/20"
            >
              {/* Scaled/cropped player container wrapper to mask YouTube branding & headers */}
              <div className="absolute inset-0 w-full h-full overflow-hidden scale-[1.25] origin-center">
                <div
                  id="watch-party-player"
                  className="absolute inset-0 w-full h-full border-none pointer-events-none"
                />
              </div>

              {/* Custom Thumbnail Overlay when paused/not playing */}
              {!isPlaying && videoId && (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center transition-all duration-300 z-10">
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt="Video thumbnail"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/50" />

                  {/* Clean play button overlay */}
                  <button
                    onClick={play}
                    className="relative z-10 w-16 h-16 flex items-center justify-center rounded-full bg-primary hover:bg-primary-hover text-white shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 group"
                  >
                    <Play size={24} className="fill-white translate-x-0.5" />
                  </button>
                </div>
              )}
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
                <button className="btn-danger gap-1.5 text-xs py-1.5 px-3" onClick={removeVideo}>
                  Remove video
                </button>
                <div className="flex items-center gap-1 text-xs text-muted ml-auto">
                  <Users size={12} />
                  <span>Controls sync to all peers</span>
                </div>
              </div>            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border text-muted py-12 px-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Play size={40} className="opacity-35 text-accent animate-pulse" />
              <p className="text-sm font-semibold text-white">Paste a YouTube URL above to start a watch party</p>
              <p className="text-xs opacity-60">Play/pause/seek syncs to all peers in the room</p>
            </div>

            <div className="w-full max-w-xl border-t border-border/40 pt-4 flex flex-col gap-2 mx-auto overflow-hidden">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider text-center mb-2">
                Or pick a quick recommendation:
              </p>
              
              {trendingVideos.length > 0 && (
                <div className="relative flex items-center group/carousel w-full">
                  {/* Left scroll button */}
                  <button 
                    onClick={scrollLeft}
                    className="absolute -left-2 z-10 p-1.5 rounded-full bg-surface/90 hover:bg-surface border border-border/50 text-muted hover:text-white transition-all active:scale-90 hover:scale-105 shadow-lg select-none opacity-0 group-hover/carousel:opacity-100 font-mono text-xs shrink-0"
                    title="Scroll Left"
                  >
                    &larr;
                  </button>

                  {/* Scroll Container */}
                  <div 
                    ref={carouselRef}
                    className="flex-1 flex gap-3 overflow-x-auto scrollbar-none py-1 scroll-smooth px-1"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {trendingVideos.map((video) => (
                      <button
                        key={video.id}
                        onClick={() => {
                          setInputUrl(video.url);
                          setVideoId(video.id);
                          setVideoUrl(video.url);
                          playerReadyRef.current = false;
                          setDuration(0);
                          setCurrentTime(0);
                          sendModuleEvent("load", { type: "load", url: video.url } as WPEvent);
                          savePartyState({ videoUrl: video.url, videoId: video.id, isPlaying: false, time: 0 });
                        }}
                        className="flex-shrink-0 w-32 text-left group transition-all"
                      >
                        <div className="w-full aspect-video bg-black relative overflow-hidden rounded-lg border border-border/40 group-hover:border-accent/60 transition-all shadow-md">
                          <img
                            src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                            alt={video.title}
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=320&auto=format&fit=crop&q=60";
                            }}
                          />
                        </div>
                        <p className="text-[10px] font-bold text-white line-clamp-2 mt-1.5 group-hover:text-accent transition-colors leading-tight h-7 overflow-hidden">
                          {video.title}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Right scroll button */}
                  <button 
                    onClick={scrollRight}
                    className="absolute -right-2 z-10 p-1.5 rounded-full bg-surface/90 hover:bg-surface border border-border/50 text-muted hover:text-white transition-all active:scale-90 hover:scale-105 shadow-lg select-none opacity-0 group-hover/carousel:opacity-100 font-mono text-xs shrink-0"
                    title="Scroll Right"
                  >
                    &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
