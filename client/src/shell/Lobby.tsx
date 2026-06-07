import { useState } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { useSocket } from "../core/SocketContext";
import { Copy, Plus, LogIn, Settings, Wifi, WifiOff, Terminal, ChevronDown, ChevronUp } from "lucide-react";

function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center justify-between bg-black/40 rounded-lg px-3 py-2 font-mono text-xs text-green-400 gap-2">
      <span className="truncate">{cmd}</span>
      <button onClick={copy} className="shrink-0 text-muted hover:text-white transition-colors">
        {copied ? "✓" : <Copy size={12} />}
      </button>
    </div>
  );
}

export default function Lobby() {
  const { joinRoom } = useWebRTC();
  const { connected, serverUrl, setServerUrl } = useSocket();

  const [name, setName] = useState(localStorage.getItem("nexroom_name") || "");
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [copiedId, setCopiedId] = useState(false);

  function saveSettings() {
    setServerUrl(serverInput);
    setShowSettings(false);
  }

  function handleJoin() {
    if (!name.trim() || !roomId.trim()) return;
    localStorage.setItem("nexroom_name", name.trim());
    joinRoom(roomId.trim(), roomName.trim() || roomId.trim(), name.trim());
  }

  function handleCreate() {
    if (!name.trim()) return;
    const id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem("nexroom_name", name.trim());
    joinRoom(id, roomName.trim() || `${name.trim()}'s Room`, name.trim());
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      {/* Background blur orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">⬡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-sm mt-1">peer-to-peer collaboration, no clouds</p>
        </div>

        {/* Server status pill */}
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${connected ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="flex-1">
            {connected ? `Signaling server connected — ${serverUrl}` : "Signaling server not running"}
          </span>
          <button className="hover:opacity-70 ml-1" onClick={() => setShowSettings(!showSettings)} title="Change server URL">
            <Settings size={12} />
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="glass rounded-xl p-4 mb-3 space-y-3">
            <p className="text-sm font-medium text-white">Signaling Server URL</p>
            <input
              type="url"
              className="w-full"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://localhost:4000"
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={saveSettings}>Save</button>
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Setup guide — shown when offline */}
        {!connected && (
          <div className="glass rounded-xl mb-4 overflow-hidden border-danger/20">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition-colors"
              onClick={() => setShowSetup(!showSetup)}
            >
              <Terminal size={14} className="text-accent" />
              How to start the signaling server
              <span className="ml-auto text-muted">{showSetup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            </button>

            {showSetup && (
              <div className="px-4 pb-4 space-y-3 border-t border-border">
                <p className="text-xs text-muted pt-3">
                  nexroom needs a tiny local server just for the initial WebRTC handshake. After peers connect, all data goes directly peer-to-peer.
                </p>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted font-medium">1. Clone the repo</p>
                  <CopyCmd cmd="git clone https://github.com/10xvick/nexroom.git" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted font-medium">2. Start the server</p>
                  <CopyCmd cmd="cd nexroom/server && npm install && npm run dev" />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted font-medium">3. Open this page — it will connect automatically</p>
                  <p className="text-xs text-muted/60">Server runs on <code className="bg-surface px-1 rounded">http://localhost:4000</code> by default</p>
                </div>

                <a
                  href="https://github.com/10xvick/nexroom"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-1"
                >
                  View on GitHub →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Main card */}
        <div className="glass rounded-2xl p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Your Name</label>
            <input
              type="text"
              className="w-full"
              placeholder="Enter your display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
            />
          </div>

          <hr className="border-border" />

          {/* Create room */}
          <div className="space-y-2">
            <label className="text-xs text-muted block">Create a Room</label>
            <input
              type="text"
              className="w-full"
              placeholder="Room name (optional)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button
              className="btn-primary w-full justify-center"
              onClick={handleCreate}
              disabled={!name.trim() || !connected}
              title={!connected ? "Start the signaling server first" : ""}
            >
              <Plus size={16} /> Create Room
            </button>
          </div>

          <div className="flex items-center gap-3 text-muted text-xs">
            <div className="flex-1 h-px bg-border" />
            or join existing
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Join room */}
          <div className="space-y-2">
            <label className="text-xs text-muted block">Room ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1"
                placeholder="Paste room ID…"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              {roomId && (
                <button className="btn-ghost px-3" onClick={copyRoomId} title="Copy ID">
                  {copiedId ? "✓" : <Copy size={14} />}
                </button>
              )}
            </div>
            <button
              className="btn-ghost w-full justify-center border-accent/30 text-accent hover:bg-accent/10"
              onClick={handleJoin}
              disabled={!name.trim() || !roomId.trim() || !connected}
              title={!connected ? "Start the signaling server first" : ""}
            >
              <LogIn size={16} /> Join Room
            </button>
          </div>

          {!connected && (
            <p className="text-xs text-danger/70 text-center">
              Start the signaling server to create or join rooms
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted/50 mt-6">
          All communication is end-to-end peer-to-peer via WebRTC
        </p>
      </div>
    </div>
  );
}
