import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from "lucide-react";
import type { ModuleProps } from "../../core/types";
import { useWebRTC } from "../../core/WebRTCContext";

function VideoTile({ stream, name, muted }: { stream: MediaStream | undefined; name: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="relative bg-surface rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-border">
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
          <span className="text-accent text-xl font-bold">{name[0]?.toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-xs text-white">
        {name}
      </div>
    </div>
  );
}

export default function VideoModule({ selfName, peers }: ModuleProps) {
  const {
    localStream, micEnabled, camEnabled, isScreenSharing,
    toggleMic, toggleCam, startScreenShare, stopScreenShare, leaveRoom,
  } = useWebRTC();

  const peerList = Array.from(peers.values());

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Grid */}
      <div
        className={`flex-1 grid gap-3 auto-rows-fr ${
          peerList.length === 0
            ? "grid-cols-1"
            : peerList.length === 1
            ? "grid-cols-2"
            : peerList.length <= 3
            ? "grid-cols-2"
            : "grid-cols-3"
        }`}
      >
        <VideoTile stream={localStream ?? undefined} name={`${selfName} (you)`} muted />
        {peerList.map((p) => (
          <VideoTile key={p.peerId} stream={p.stream} name={p.peerName} />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-2">
        <button
          onClick={toggleMic}
          className={`btn ${micEnabled ? "btn-ghost" : "btn-danger"}`}
          title={micEnabled ? "Mute" : "Unmute"}
        >
          {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={toggleCam}
          className={`btn ${camEnabled ? "btn-ghost" : "btn-danger"}`}
          title={camEnabled ? "Disable camera" : "Enable camera"}
        >
          {camEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className={`btn ${isScreenSharing ? "btn-danger" : "btn-ghost"}`}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
        >
          {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
        </button>
        <button onClick={leaveRoom} className="btn-danger" title="Leave room">
          <PhoneOff size={18} />
        </button>
      </div>

      {peerList.length === 0 && (
        <p className="text-center text-sm text-muted">Waiting for others to join…</p>
      )}
    </div>
  );
}
