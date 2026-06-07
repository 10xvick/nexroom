import { useState } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { useSocket } from "../core/SocketContext";
import { Copy, Plus, LogIn, Settings, Wifi, WifiOff } from "lucide-react";

export default function Lobby() {
  const { joinRoom } = useWebRTC();
  const { connected, serverUrl, setServerUrl } = useSocket();

  const [name, setName] = useState(localStorage.getItem("nexroom_name") || "");
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [copied, setCopied] = useState(false);

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

  function copyLink() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⬡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-sm mt-1">peer-to-peer collaboration, no clouds</p>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 ${connected ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? `Signaling connected → ${serverUrl}` : `Signaling offline — start server at ${serverUrl}`}
          <button className="ml-auto hover:opacity-70" onClick={() => setShowSettings(true)}>
            <Settings size={12} />
          </button>
        </div>

        {/* Settings overlay */}
        {showSettings && (
          <div className="glass rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-white">Signaling Server URL</p>
            <input
              type="url"
              className="w-full"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://localhost:4000"
            />
            <p className="text-xs text-muted">Run locally: <code className="bg-surface px-1 rounded">cd server && npm i && npm run dev</code></p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={saveSettings}>Save</button>
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Card */}
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
              disabled={!name.trim()}
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
                <button className="btn-ghost px-3" onClick={copyLink} title="Copy ID">
                  {copied ? "✓" : <Copy size={14} />}
                </button>
              )}
            </div>
            <button
              className="btn-ghost w-full justify-center border-accent/30 text-accent hover:bg-accent/10"
              onClick={handleJoin}
              disabled={!name.trim() || !roomId.trim()}
            >
              <LogIn size={16} /> Join Room
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted/50 mt-6">
          All communication is end-to-end peer-to-peer via WebRTC
        </p>
      </div>
    </div>
  );
}
