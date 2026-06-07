import { useEffect, useRef, useState } from "react";
import type { ModuleProps } from "../../core/types";
import { Play, Pause, Link, Users } from "lucide-react";

type WPEvent =
  | { type: "load"; url: string }
  | { type: "play"; time: number }
  | { type: "pause"; time: number }
  | { type: "seek"; time: number };

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

export default function WatchPartyModule({ selfId, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const suppressSync = useRef(false);

  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "watchparty") return;
      if (env.from === selfId) return;

      const ev = env.payload as WPEvent;
      suppressSync.current = true;

      if (ev.type === "load") {
        setVideoUrl(ev.url);
        setVideoId(extractVideoId(ev.url));
      } else if (ev.type === "play") {
        setIsPlaying(true);
        sendPlayerCommand("playVideo");
      } else if (ev.type === "pause") {
        setIsPlaying(false);
        sendPlayerCommand("pauseVideo");
      } else if (ev.type === "seek") {
        sendPlayerCommand("seekTo", ev.time);
      }

      setTimeout(() => { suppressSync.current = false; }, 300);
    });
  }, [onModuleEvent, selfId]);

  function sendPlayerCommand(func: string, ...args: unknown[]) {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  }

  function loadVideo() {
    const id = extractVideoId(inputUrl);
    if (!id) return;
    setVideoId(id);
    setVideoUrl(inputUrl);
    if (!suppressSync.current) {
      sendModuleEvent("load", { type: "load", url: inputUrl } as WPEvent);
    }
    setInputUrl("");
  }

  function play() {
    setIsPlaying(true);
    sendPlayerCommand("playVideo");
    if (!suppressSync.current) sendModuleEvent("play", { type: "play", time: 0 } as WPEvent);
  }

  function pause() {
    setIsPlaying(false);
    sendPlayerCommand("pauseVideo");
    if (!suppressSync.current) sendModuleEvent("pause", { type: "pause", time: 0 } as WPEvent);
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
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

      {/* Player */}
      {videoId ? (
        <div className="flex-1 flex flex-col gap-3">
          <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
            <iframe
              ref={playerRef}
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Watch Party"
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              className={`btn ${isPlaying ? "btn-ghost" : "btn-primary"}`}
              onClick={isPlaying ? pause : play}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? "Pause for all" : "Play for all"}
            </button>
            <div className="flex items-center gap-1 text-xs text-muted ml-auto">
              <Users size={12} />
              <span>Controls sync to all peers</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-muted">
          <Play size={40} className="opacity-30" />
          <p className="text-sm">Paste a YouTube URL above to start a watch party</p>
          <p className="text-xs opacity-60">Play/pause/seek syncs to all peers in the room</p>
        </div>
      )}
    </div>
  );
}
