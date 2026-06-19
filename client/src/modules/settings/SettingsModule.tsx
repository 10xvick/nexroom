import { useState, useEffect } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import { User, Volume2, Video, Download, Sliders } from "lucide-react";

export default function SettingsModule() {
  const { selfName, setSelfName, micEnabled, camEnabled, toggleMic, toggleCam } = useWebRTC();
  const [nameInput, setNameInput] = useState(selfName);
  const [autoDownload, setAutoDownload] = useState(() => {
    return localStorage.getItem("nexroom_autodownload") !== "false";
  });

  useEffect(() => {
    setNameInput(selfName);
  }, [selfName]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      setSelfName(nameInput.trim());
    }
  };

  const handleToggleAutoDownload = () => {
    const nextVal = !autoDownload;
    setAutoDownload(nextVal);
    localStorage.setItem("nexroom_autodownload", nextVal ? "true" : "false");
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-bg p-6 text-white flex justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Room Settings</h2>
          <p className="text-muted text-sm mt-1">Configure your personal preferences, audio/video devices, and data options.</p>
        </div>

        {/* Profile Card */}
        <div className="glass rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 border border-accent/20 rounded-xl text-accent">
              <User size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Personal Profile</h3>
              <p className="text-xs text-muted">Change how you appear to others in the room.</p>
            </div>
          </div>
          <form onSubmit={handleSaveName} className="flex gap-3 mt-2">
            <input
              type="text"
              className="flex-1 px-3.5 py-2 text-sm bg-surface border border-border rounded-xl focus:border-accent focus:outline-none"
              placeholder="Enter your name..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <button type="submit" className="btn-primary px-5 py-2 text-sm">
              Save
            </button>
          </form>
        </div>

        {/* Audio / Video controls */}
        <div className="glass rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 border border-accent/20 rounded-xl text-accent">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Devices & Media</h3>
              <p className="text-xs text-muted">Toggle your active inputs.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            {/* Mic Toggle Button */}
            <button
              onClick={toggleMic}
              className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                micEnabled
                  ? "bg-success/10 border-success text-success"
                  : "bg-surface border-border text-muted hover:text-white"
              }`}
            >
              <Volume2 size={24} />
              <span className="text-xs font-semibold">{micEnabled ? "Microphone Active" : "Microphone Muted"}</span>
            </button>

            {/* Camera Toggle Button */}
            <button
              onClick={toggleCam}
              className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                camEnabled
                  ? "bg-success/10 border-success text-success"
                  : "bg-surface border-border text-muted hover:text-white"
              }`}
            >
              <Video size={24} />
              <span className="text-xs font-semibold">{camEnabled ? "Camera Active" : "Camera Muted"}</span>
            </button>
          </div>
        </div>

        {/* Data Options */}
        <div className="glass rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 border border-accent/20 rounded-xl text-accent">
                <Download size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Auto-download Files</h3>
                <p className="text-xs text-muted">Automatically receive and download file transfers sent in the chat.</p>
              </div>
            </div>

            <button
              onClick={handleToggleAutoDownload}
              className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none ${
                autoDownload ? "bg-accent" : "bg-surface border border-border"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow ${
                  autoDownload ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
