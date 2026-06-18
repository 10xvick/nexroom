import { useState, useEffect, useRef } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { Copy, Plus, LogIn, Loader2, CheckCircle2, ArrowLeft, Link, Code2, Shield } from "lucide-react";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { 
    navigator.clipboard.writeText(text); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 2500); 
  }
  return (
    <button onClick={copy} className="btn-ghost gap-1.5 text-xs py-1.5 px-3 rounded-lg border border-border/40 hover:bg-surface/60 transition-all">
      {copied ? (
        <><CheckCircle2 size={13} className="text-success animate-scale-in" /> Copied!</>
      ) : (
        <><Copy size={13} /> {label}</>
      )}
    </button>
  );
}

function CodeBox({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-2 animate-slide-up">
      <p className="text-xs text-muted font-bold uppercase tracking-wider">{label}</p>
      <div className="relative">
        <textarea 
          readOnly 
          value={code} 
          rows={3}
          className="w-full font-mono text-xs bg-black/40 border border-border/40 rounded-xl px-4 py-3 text-accent resize-none focus:outline-none focus:border-accent/40" 
        />
        <div className="absolute top-2 right-2">
          <CopyBtn text={code} label="Copy" />
        </div>
      </div>
    </div>
  );
}

function inviteUrl(code: string, method: string | null) {
  if (method === "manual") {
    return `${window.location.origin}${window.location.pathname}#i=${encodeURIComponent(code)}`;
  }
  return `${window.location.origin}${window.location.pathname}#r=${encodeURIComponent(code)}`;
}

export default function Lobby() {
  const { phase, myCode, gatherError, signalingMethod, startHost, startGuest, completeHandshake } = useWebRTC();

  const [name, setName] = useState(localStorage.getItem("nexroom_name") || "");
  const [roomName, setRoomName] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [view, setView] = useState<"home" | "create" | "join_url" | "join_manual">("home");
  const [showRawCode, setShowRawCode] = useState(false);
  const [pendingOfferCode, setPendingOfferCode] = useState("");
  const [pendingRoomName, setPendingRoomName] = useState("");
  const [manualOfferInput, setManualOfferInput] = useState("");
  const autoStarted = useRef(false);

  function saveName(n: string) { 
    localStorage.setItem("nexroom_name", n); 
    setName(n); 
  }

  // ── Detect invite URL on mount ───────────────────────────────────────────────
  useEffect(() => {
    const match = window.location.hash.match(/[#&]i=([^&]+)/);
    if (match) {
      const code = decodeURIComponent(match[1]);
      setPendingOfferCode(code);
      setPendingRoomName("Manual Room Invite");
      setView("join_url");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const rMatch = window.location.hash.match(/[#&]r=([^&]+)/);
    if (rMatch) {
      const code = decodeURIComponent(rMatch[1]);
      setPendingOfferCode(code);
      setPendingRoomName(`Room Code: ${code}`);
      setView("join_url");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // ── Auto-join when name is set in URL-invite view ───────────────────────────
  useEffect(() => {
    if (view === "join_url" && pendingOfferCode && name.trim() && !autoStarted.current && phase === "idle") {
      autoStarted.current = true;
      startGuest(pendingOfferCode, name.trim());
    }
  }, [name, view, pendingOfferCode, phase]);

  async function handleCreate() {
    if (!name.trim()) return;
    await startHost(name.trim(), roomName.trim() || `${name.trim()}'s Room`);
  }

  async function handleJoin() {
    if (!name.trim() || !manualOfferInput.trim()) return;
    await startGuest(manualOfferInput.trim(), name.trim());
  }

  async function handleComplete() {
    if (!answerInput.trim()) return;
    await completeHandshake(answerInput.trim());
  }

  const url = myCode ? inviteUrl(myCode, signalingMethod) : "";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#090a0f] relative overflow-hidden">
      {/* Background Glow Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-scale-in">
        {/* Logo/Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 text-accent mb-4 shadow-[0_0_32px_rgba(79,142,247,0.15)] animate-pulse">
            <span className="text-3xl font-extrabold select-none">⬡</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-xs font-semibold uppercase tracking-widest mt-2">
            Serverless Peer-to-Peer Workspace
          </p>
        </div>

        {/* ── Gathering spinner ── */}
        {phase === "gathering" && (
          <div className="glass rounded-3xl p-8 flex flex-col items-center gap-4 text-center border-accent/25 shadow-lg shadow-accent/5">
            <div className="p-3 bg-accent/10 rounded-2xl">
              <Loader2 size={32} className="text-accent animate-spin" />
            </div>
            <div>
              <p className="text-base font-bold text-white">Configuring Connection...</p>
              <p className="text-xs text-muted/80 mt-1">
                {signalingMethod === "manual"
                  ? "STUN discovering network path. Takes a few seconds."
                  : "Establishing secure signaling link..."}
              </p>
            </div>
          </div>
        )}

        {/* ── offer_ready: host shares manual invite link ── */}
        {phase === "offer_ready" && signalingMethod === "manual" && (
          <div className="glass rounded-3xl p-6 space-y-5 shadow-2xl border-border/40 animate-slide-up">
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Step 1 — Share Invite Link</p>
              <p className="text-xs text-muted">Share the link via any channel. When they open it, their answer code will be generated automatically.</p>
            </div>

            <div className="flex items-center gap-2 bg-black/40 rounded-xl px-4 py-3 border border-accent/20">
              <Link size={14} className="text-accent shrink-0" />
              <span className="text-xs text-accent/90 truncate flex-1 font-mono">{url}</span>
              <CopyBtn text={url} label="Copy" />
            </div>

            <button
              onClick={() => setShowRawCode(!showRawCode)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
            >
              <Code2 size={13} /> {showRawCode ? "Hide raw code" : "Trouble with link? Use raw code"}
            </button>
            {showRawCode && <CodeBox code={myCode} label="Raw invite code" />}

            <hr className="border-border/30" />
            
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-white">Step 2 — Paste Answer Code</p>
              <p className="text-xs text-muted">After they open your link, they'll see an answer code. Paste it here to connect.</p>
            </div>
            
            <div className="space-y-3">
              <textarea 
                rows={3} 
                className="w-full font-mono text-xs resize-none"
                placeholder="Paste answer code here…"
                value={answerInput} 
                onChange={(e) => setAnswerInput(e.target.value)} 
              />
              {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
              <button 
                className="btn-primary w-full justify-center py-3 rounded-xl" 
                onClick={handleComplete} 
                disabled={!answerInput.trim()}
              >
                <CheckCircle2 size={16} /> Establish Connection
              </button>
            </div>
          </div>
        )}

        {/* ── answer_ready: guest shows answer code or waits for handshake ── */}
        {phase === "answer_ready" && (
          <div className="glass rounded-3xl p-6 space-y-4 shadow-2xl border-border/40 animate-slide-up">
            {signalingMethod === "manual" ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Send this answer code back</p>
                  <p className="text-xs text-muted">Copy this and send it back to the person who shared the invite link.</p>
                </div>
                <CodeBox code={myCode} label="Your answer code" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center py-6">
                <div className="p-3 bg-accent/10 rounded-2xl">
                  <Loader2 size={32} className="text-accent animate-spin" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Connecting Automatically...</p>
                  <p className="text-xs text-muted/80 mt-1">Performing secure handshake with Host using {signalingMethod}.</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-xs text-muted bg-surface/30 rounded-xl px-4 py-3 justify-center border border-border/20">
              <Loader2 size={13} className="animate-spin shrink-0 text-accent" />
              <span>Waiting for host acceptance…</span>
            </div>
          </div>
        )}

        {/* ── join_url: guest opened invite link, needs name ── */}
        {phase === "idle" && view === "join_url" && (
          <div className="glass rounded-3xl p-6 space-y-5 shadow-2xl border-border/40 animate-slide-up">
            <div>
              <p className="text-base font-bold text-white">You're Invited</p>
              <p className="text-xs text-muted mt-0.5">To join room: <span className="text-accent font-semibold">{pendingRoomName}</span></p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Your Display Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder="Enter your display name"
                value={name} 
                onChange={(e) => saveName(e.target.value)} 
                maxLength={32}
                autoFocus 
              />
            </div>
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <div className="space-y-3 pt-2">
              <button 
                className="btn-primary w-full justify-center py-3 rounded-xl"
                onClick={() => { autoStarted.current = true; startGuest(pendingOfferCode, name.trim()); }}
                disabled={!name.trim()}
              >
                <LogIn size={16} /> Connect to Workspace
              </button>
              <button 
                onClick={() => setView("home")} 
                className="text-xs text-muted hover:text-white w-full text-center transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── home ── */}
        {phase === "idle" && view === "home" && (
          <div className="glass rounded-3xl p-6 space-y-5 shadow-2xl border-border/40 animate-slide-up">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Your Display Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder="Enter display name (e.g. Alice)"
                value={name} 
                onChange={(e) => saveName(e.target.value)} 
                maxLength={32} 
              />
            </div>
            
            <hr className="border-border/30" />
            
            <div className="space-y-3">
              <button 
                className="btn-primary w-full justify-center py-3 rounded-xl" 
                onClick={() => setView("create")} 
                disabled={!name.trim()}
              >
                <Plus size={16} /> Create New Workspace
              </button>
              <button 
                className="btn-ghost w-full justify-center py-3 rounded-xl"
                onClick={() => setView("join_manual")} 
                disabled={!name.trim()}
              >
                <Code2 size={16} /> Join Existing Workspace
              </button>
            </div>
          </div>
        )}

        {/* ── create ── */}
        {phase === "idle" && view === "create" && (
          <div className="glass rounded-3xl p-6 space-y-5 shadow-2xl border-border/40 animate-slide-up">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("home")} className="p-1.5 hover:bg-surface rounded-lg text-muted hover:text-white transition-colors">
                <ArrowLeft size={16} />
              </button>
              <p className="text-base font-bold text-white">Create a Workspace</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Room / Workspace Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder={`${name.trim()}'s Workspace`}
                value={roomName} 
                onChange={(e) => setRoomName(e.target.value)} 
              />
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              A secure workspace link and room code will be generated automatically to share with your peers.
            </p>
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <button className="btn-primary w-full justify-center py-3 rounded-xl" onClick={handleCreate}>
              <Plus size={16} /> Initialize Workspace
            </button>
          </div>
        )}

        {/* ── join manual (supports 6-character room codes AND base64 manual strings) ── */}
        {phase === "idle" && view === "join_manual" && (
          <div className="glass rounded-3xl p-6 space-y-5 shadow-2xl border-border/40 animate-slide-up">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("home")} className="p-1.5 hover:bg-surface rounded-lg text-muted hover:text-white transition-colors">
                <ArrowLeft size={16} />
              </button>
              <p className="text-base font-bold text-white">Join a Workspace</p>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs text-muted leading-relaxed">
                Paste a 6-character Room Code (e.g. A3B89C) or a manual offline invitation string to connect.
              </p>
              <textarea 
                rows={4} 
                className="w-full font-mono text-xs resize-none"
                placeholder="Enter Room Code or manual invite string…"
                value={manualOfferInput} 
                onChange={(e) => setManualOfferInput(e.target.value)} 
              />
            </div>
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <button 
              className="btn-primary w-full justify-center py-3 rounded-xl" 
              onClick={handleJoin} 
              disabled={!manualOfferInput.trim()}
            >
              <LogIn size={16} /> Establish Connection
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted/50 mt-8 font-semibold select-none">
          <Shield size={11} />
          <span>100% Serverless · Direct P2P via WebRTC</span>
        </div>
      </div>
    </div>
  );
}
