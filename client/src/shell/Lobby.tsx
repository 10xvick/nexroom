import { useState, useEffect, useRef } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { Copy, Plus, LogIn, Loader2, CheckCircle2, ArrowLeft, Code2 } from "lucide-react";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { 
    navigator.clipboard.writeText(text); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 2500); 
  }
  return (
    <button onClick={copy} className="btn-ghost gap-1.5 text-xs py-1.5 px-2.5">
      {copied ? <><CheckCircle2 size={13} className="text-success" /> Copied!</> : <><Copy size={13} /> {label}</>}
    </button>
  );
}

function CodeBox({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted font-medium">{label}</p>
      <div className="relative">
        <textarea 
          readOnly 
          value={code} 
          rows={3}
          className="w-full font-mono text-xs bg-black/40 border border-border rounded-lg px-3 py-2 text-accent resize-none focus:outline-none" 
        />
        <div className="absolute top-2 right-2">
          <CopyBtn text={code} label="Copy" />
        </div>
      </div>
    </div>
  );
}

export default function Lobby() {
  const { phase, myCode, gatherError, signalingMethod, startHost, startGuest, completeHandshake } = useWebRTC();

  const [name, setName] = useState(localStorage.getItem("nexroom_name") || "");
  const [roomName, setRoomName] = useState(() => {
    const savedName = localStorage.getItem("nexroom_name") || "";
    return savedName.trim() ? `${savedName.trim()}'s Room` : "";
  });
  const [answerInput, setAnswerInput] = useState("");
  const [manualOfferInput, setManualOfferInput] = useState("");
  const [preferredMethod, setPreferredMethod] = useState<"auto" | "mqtt" | "peerjs" | "manual">("auto");
  const [isRoomNameDirty, setIsRoomNameDirty] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(30);

  function saveName(n: string) { 
    localStorage.setItem("nexroom_name", n); 
    setName(n); 
  }

  function handleNameChange(newName: string) {
    saveName(newName);
    if (!isRoomNameDirty) {
      setRoomName(newName.trim() ? `${newName.trim()}'s Room` : "");
    }
  }

  function handleRoomNameChange(newRoomName: string) {
    setIsRoomNameDirty(true);
    setRoomName(newRoomName);
  }

  function handlePasteInputChange(val: string) {
    const trimmed = val.trim();
    if (trimmed.length <= 10) {
      setManualOfferInput(trimmed.toUpperCase());
    } else {
      setManualOfferInput(trimmed);
    }
  }



  async function handleCreate() {
    if (!name.trim()) return;
    await startHost(name.trim(), roomName.trim() || `${name.trim()}'s Room`, preferredMethod, timeoutSec);
  }

  async function handleJoin() {
    if (!name.trim() || !manualOfferInput.trim()) return;
    await startGuest(manualOfferInput.trim(), name.trim(), preferredMethod, timeoutSec);
  }

  async function handleComplete() {
    if (!answerInput.trim()) return;
    await completeHandshake(answerInput.trim());
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 bg-bg">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⬡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-sm mt-1">serverless peer-to-peer collaboration</p>
        </div>

        {/* ── Gathering spinner ── */}
        {phase === "gathering" && (
          <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3 w-full">
            <Loader2 size={28} className="text-accent animate-spin" />
            <p className="text-sm text-white font-medium">Setting up connection…</p>
            <p className="text-xs text-muted text-center">
              {signalingMethod === "manual"
                ? "STUN servers discovering your network path. Takes a few seconds."
                : "Establishing secure automated signaling link..."}
            </p>
          </div>
        )}

        {/* ── offer_ready: host shares manual invite link ── */}
        {phase === "offer_ready" && signalingMethod === "manual" && (
          <div className="glass rounded-2xl p-6 space-y-5 w-full">
            <p className="text-sm font-semibold text-white">Step 1 — Send this invite code</p>
            <p className="text-xs text-muted">Copy the invite code below and send it to the host or peer you want to connect with.</p>

            <CodeBox code={myCode} label="Invite code" />

            <hr className="border-border" />
            <p className="text-sm font-semibold text-white">Step 2 — Enter their answer code</p>
            <p className="text-xs text-muted">After they import your invite code, they will generate an answer code. Enter it below to connect.</p>
            
            <div className="space-y-3">
              <textarea 
                rows={3} 
                className="w-full font-mono text-xs resize-none"
                placeholder="Enter answer code here…"
                value={answerInput} 
                onChange={(e) => setAnswerInput(e.target.value)} 
              />
              {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
              <button 
                className="btn-primary w-full justify-center" 
                onClick={handleComplete} 
                disabled={!answerInput.trim()}
              >
                <CheckCircle2 size={16} /> Connect
              </button>
            </div>
          </div>
        )}

        {/* ── answer_ready: guest shows answer code or waits for handshake ── */}
        {phase === "answer_ready" && (
          <div className="glass rounded-2xl p-6 space-y-4 w-full">
            {signalingMethod === "manual" ? (
              <>
                <p className="text-sm font-semibold text-white">Send this answer code back</p>
                <p className="text-xs text-muted">Copy this and send it back to the host.</p>
                <CodeBox code={myCode} label="Your answer code" />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <Loader2 size={28} className="text-accent animate-spin" />
                <p className="text-sm text-white font-medium">Connecting automatically...</p>
                <p className="text-xs text-muted">Performing secure handshake with Host using {signalingMethod}.</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted bg-surface/50 rounded-lg px-3 py-2 justify-center">
              <Loader2 size={12} className="animate-spin shrink-0" />
              Waiting for the host to accept…
            </div>
          </div>
        )}

        {/* ── unified setup screen ── */}
        {phase === "idle" && (
          <div className="space-y-6 w-full">
            {/* Nickname input at the top */}
            <div className="glass rounded-2xl p-5 space-y-3">
              <div>
                <label className="text-xs text-muted mb-1.5 block font-semibold">Your Display Name</label>
                <input 
                  type="text" 
                  className="w-full text-sm font-semibold" 
                  placeholder="Enter nickname..."
                  value={name} 
                  onChange={(e) => handleNameChange(e.target.value)} 
                  maxLength={15} 
                />
              </div>
            </div>

            {gatherError && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3.5 text-xs text-danger font-semibold text-center animate-fade-in">
                {gatherError}
              </div>
            )}

            {/* Split layout: Host a Room (Create) and Join a Room (Join) */}
            <div className="flex flex-col gap-6">
              {/* Host Section */}
              <div className="glass rounded-2xl p-5 space-y-4 border border-border/40">
                <div className="flex items-center gap-2 border-b border-border/30 pb-2">
                  <Plus size={16} className="text-accent" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Host a Room</span>
                </div>

                <div>
                  <label className="text-xs text-muted mb-1.5 block">Room Title</label>
                  <input 
                    type="text" 
                    className="w-full text-sm" 
                    placeholder="e.g. Brainstorming"
                    value={roomName} 
                    onChange={(e) => handleRoomNameChange(e.target.value)} 
                    maxLength={32}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted block font-medium">Protocol Config</label>
                  <div className="grid grid-cols-4 gap-1 bg-black/25 p-1 rounded-lg border border-border/40">
                    {(["auto", "mqtt", "peerjs", "manual"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPreferredMethod(method)}
                        className={`py-1 text-[10px] font-bold rounded transition-all uppercase ${
                          preferredMethod === method
                            ? "bg-accent text-bg shadow-sm"
                            : "text-muted hover:text-white"
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted leading-relaxed">
                    {preferredMethod === "auto" && "Auto: Races MQTT & PeerJS brokers in parallel (recommended)."}
                    {preferredMethod === "mqtt" && "MQTT: Connects using explicit MQTT broker only."}
                    {preferredMethod === "peerjs" && "PeerJS: Connects using explicit PeerJS broker only."}
                    {preferredMethod === "manual" && "Manual: Offline copy-paste connection (no external brokers)."}
                  </p>

                  {preferredMethod !== "manual" && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/20 mt-2">
                      <label className="text-[10px] text-muted font-medium">Signaling Timeout (sec)</label>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        className="w-16 text-center text-xs py-0.5 px-1 bg-black/30 border border-border/40 rounded text-white"
                        value={timeoutSec}
                        onChange={(e) => setTimeoutSec(Math.max(5, parseInt(e.target.value) || 30))}
                      />
                    </div>
                  )}
                </div>

                <button 
                  className="btn-primary w-full justify-center text-sm font-semibold py-2.5 mt-2" 
                  onClick={handleCreate} 
                  disabled={!name.trim()}
                >
                  Create & Launch Room
                </button>
              </div>

              {/* Join Section */}
              <div className="glass rounded-2xl p-5 space-y-4 border border-border/40">
                <div className="flex items-center gap-2 border-b border-border/30 pb-2">
                  <LogIn size={16} className="text-accent" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Join a Room</span>
                </div>

                <div className="space-y-2">
                  <textarea 
                    rows={2} 
                    className="w-full font-mono text-xs resize-none"
                    placeholder="Enter Room Code (e.g. UDOYL5P) or Manual Invite Code..."
                    value={manualOfferInput} 
                    onChange={(e) => handlePasteInputChange(e.target.value)} 
                  />
                  <p className="text-[9px] text-muted leading-relaxed">
                    For automated rooms, enter the 7-character Room Code (capital letters only). For offline manual rooms, paste the full invite code.
                  </p>
                </div>

                <button 
                  className="btn-ghost w-full justify-center border-accent/30 text-accent hover:bg-accent/10 text-sm font-semibold py-2.5 mt-2" 
                  onClick={handleJoin} 
                  disabled={!name.trim() || !manualOfferInput.trim()}
                >
                  Connect & Join
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="w-full text-center text-xs text-muted/50 py-4 select-none">
        100% serverless · peer-to-peer via WebRTC + STUN
      </footer>
    </div>
  );
}
