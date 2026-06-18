import { useState, useEffect, useRef } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { 
  Copy, Plus, LogIn, Loader2, CheckCircle2, ArrowLeft, 
  Link, Code2, Users, Network, ShieldCheck, Cpu 
} from "lucide-react";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { 
    navigator.clipboard.writeText(text); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 2500); 
  }
  return (
    <button 
      onClick={copy} 
      className="btn-ghost py-1.5 px-3 rounded-lg text-xs gap-1.5 hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-all duration-300"
    >
      {copied ? (
        <><CheckCircle2 size={13} className="text-success" /> Copied!</>
      ) : (
        <><Copy size={13} /> {label}</>
      )}
    </button>
  );
}

function CodeBox({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted font-bold uppercase tracking-wider">{label}</p>
      <div className="relative group">
        <textarea 
          readOnly 
          value={code} 
          rows={3}
          className="w-full font-mono text-xs bg-black/40 border border-border group-hover:border-border-light rounded-xl px-4 py-3 text-accent-glow resize-none focus:outline-none transition-colors" 
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg relative overflow-hidden select-none">
      {/* ── Background Grid & Glowing Orbs ── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#06070a)]" />
        
        {/* Glowing Orbs */}
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent/8 blur-[120px] glow-bg" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-500/6 blur-[120px] glow-bg" style={{ animationDelay: "-5s" }} />
      </div>

      <div className="relative w-full max-w-lg z-10">
        {/* Header App Brand */}
        <div className="text-center mb-10 float-effect">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent to-purple-600 p-[1px] shadow-[0_8px_30px_rgba(99,102,241,0.2)] mb-4">
            <div className="w-full h-full bg-[#0d0e12] rounded-[15px] flex items-center justify-center">
              <Network size={28} className="text-accent-glow" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight font-display bg-gradient-to-r from-white via-white to-muted bg-clip-text text-transparent">
            nexroom
          </h1>
          <p className="text-muted text-sm font-medium mt-2 tracking-wide">
            Serverless Peer-to-Peer Workspace
          </p>
        </div>

        {/* ── Gathering spinner ── */}
        {phase === "gathering" && (
          <div className="glass rounded-3xl p-10 flex flex-col items-center gap-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-pulse" />
              <Loader2 size={32} className="text-accent animate-spin" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base text-white font-bold tracking-tight">Configuring Connection Path...</p>
              <p className="text-xs text-muted max-w-sm leading-relaxed">
                {signalingMethod === "manual"
                  ? "Resolving ICE candidates with STUN/TURN servers to bypass NAT. This will generate your connection payload."
                  : "Connecting to secure distributed signaling relay..."}
              </p>
            </div>
          </div>
        )}

        {/* ── offer_ready: host shares manual invite link ── */}
        {phase === "offer_ready" && signalingMethod === "manual" && (
          <div className="glass rounded-3xl p-8 space-y-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <ShieldCheck size={20} className="text-accent-glow" />
              <p className="text-sm font-bold text-white uppercase tracking-wider">Step 1 — Share Invite</p>
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              Copy the secure invite link and send it to your peer. They will paste their answer back to establish the channel.
            </p>

            <div className="flex items-center gap-3 bg-black/40 rounded-xl px-4 py-3 border border-border/80 hover:border-border-light transition-colors">
              <Link size={14} className="text-accent shrink-0" />
              <span className="text-xs text-accent-glow font-mono truncate flex-1">{url}</span>
              <CopyBtn text={url} label="Copy" />
            </div>

            <button
              onClick={() => setShowRawCode(!showRawCode)}
              className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors"
            >
              <Code2 size={13} /> {showRawCode ? "Hide raw code payload" : "Alternative: Use raw payload code"}
            </button>
            
            {showRawCode && <CodeBox code={myCode} label="Host Offer Payload" />}

            <div className="flex items-center gap-3 border-b border-b-border pt-4 pb-4">
              <Code2 size={20} className="text-purple-400" />
              <p className="text-sm font-bold text-white uppercase tracking-wider">Step 2 — Receive Answer</p>
            </div>
            
            <textarea 
              rows={3} 
              className="w-full font-mono text-xs resize-none"
              placeholder="Paste the receiver's answer payload here…"
              value={answerInput} 
              onChange={(e) => setAnswerInput(e.target.value)} 
            />
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <button 
              className="btn-primary w-full justify-center py-3" 
              onClick={handleComplete} 
              disabled={!answerInput.trim()}
            >
              <CheckCircle2 size={16} /> Establish P2P Connection
            </button>
          </div>
        )}

        {/* ── answer_ready: guest shows answer code or waits for handshake ── */}
        {phase === "answer_ready" && (
          <div className="glass rounded-3xl p-8 space-y-5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            {signalingMethod === "manual" ? (
              <>
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <ShieldCheck size={20} className="text-accent-glow" />
                  <p className="text-sm font-bold text-white uppercase tracking-wider">Answer Payload Generated</p>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Send this response payload back to the host. Once they paste it, the direct tunnel will establish.
                </p>
                <CodeBox code={myCode} label="Receiver Answer Payload" />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center py-6">
                <Loader2 size={32} className="text-accent animate-spin" />
                <p className="text-base text-white font-bold">Connecting automatically...</p>
                <p className="text-xs text-muted max-w-xs leading-relaxed">
                  Negotiating direct peer connection via {signalingMethod}.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-xs text-muted bg-surface-light/50 rounded-xl px-4 py-3 justify-center border border-border">
              <Loader2 size={13} className="animate-spin shrink-0 text-accent" />
              <span>Awaiting connection validation from host…</span>
            </div>
          </div>
        )}

        {/* ── join_url: guest opened invite link, needs name ── */}
        {phase === "idle" && view === "join_url" && (
          <div className="glass rounded-3xl p-8 space-y-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white font-display">You are Invited</h2>
              <p className="text-xs text-muted">Join room: <span className="text-accent-glow font-bold">{pendingRoomName}</span></p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted font-bold uppercase tracking-wider block">Your Display Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder="e.g. John Doe"
                value={name} 
                onChange={(e) => saveName(e.target.value)} 
                maxLength={32}
                autoFocus 
              />
            </div>
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <div className="space-y-3">
              <button 
                className="btn-primary w-full justify-center py-3"
                onClick={() => { autoStarted.current = true; startGuest(pendingOfferCode, name.trim()); }}
                disabled={!name.trim()}
              >
                <LogIn size={16} /> Enter Workspace
              </button>
              <button 
                onClick={() => setView("home")} 
                className="text-xs text-muted hover:text-white w-full text-center transition-colors py-1"
              >
                Cancel & go home
              </button>
            </div>
          </div>
        )}

        {/* ── home ── */}
        {phase === "idle" && view === "home" && (
          <div className="glass rounded-3xl p-8 space-y-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="space-y-2">
              <label className="text-xs text-muted font-bold uppercase tracking-wider block">Display Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder="Enter your display name…"
                value={name} 
                onChange={(e) => saveName(e.target.value)} 
                maxLength={32} 
              />
            </div>
            
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-[10px] text-muted font-bold uppercase tracking-wider">workspace setup</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button 
                className="btn-primary w-full justify-center py-3.5" 
                onClick={() => setView("create")} 
                disabled={!name.trim()}
              >
                <Plus size={18} /> Create New Workspace
              </button>
              <button 
                className="btn-ghost w-full justify-center py-3.5 border-border hover:border-accent/30"
                onClick={() => setView("join_manual")} 
                disabled={!name.trim()}
              >
                <LogIn size={18} /> Join Existing Room
              </button>
            </div>
          </div>
        )}

        {/* ── create ── */}
        {phase === "idle" && view === "create" && (
          <div className="glass rounded-3xl p-8 space-y-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <button 
                onClick={() => setView("home")} 
                className="text-muted hover:text-white transition-colors p-1"
              >
                <ArrowLeft size={16} />
              </button>
              <p className="text-base font-bold text-white font-display">Create Workspace</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted font-bold uppercase tracking-wider block">Workspace Name</label>
              <input 
                type="text" 
                className="w-full" 
                placeholder={`${name.trim()}'s Workspace`}
                value={roomName} 
                onChange={(e) => setRoomName(e.target.value)} 
              />
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              Creates a secure direct connection channel. You will be given a 6-character room code to invite peers.
            </p>
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <button className="btn-primary w-full justify-center py-3.5" onClick={handleCreate}>
              <Plus size={18} /> Launch Workspace
            </button>
          </div>
        )}

        {/* ── join manual ── */}
        {phase === "idle" && view === "join_manual" && (
          <div className="glass rounded-3xl p-8 space-y-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border-white/5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <button 
                onClick={() => setView("home")} 
                className="text-muted hover:text-white transition-colors p-1"
              >
                <ArrowLeft size={16} />
              </button>
              <p className="text-base font-bold text-white font-display">Connect to Room</p>
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              Enter the 6-character Room Code shared with you, or paste the manual host payload.
            </p>
            
            <textarea 
              rows={4} 
              className="w-full font-mono text-xs resize-none"
              placeholder="Room Code (e.g. A3B89C) or manual invite payload…"
              value={manualOfferInput} 
              onChange={(e) => setManualOfferInput(e.target.value)} 
            />
            
            {gatherError && <p className="text-xs text-danger font-medium">{gatherError}</p>}
            
            <button 
              className="btn-primary w-full justify-center py-3.5" 
              onClick={handleJoin} 
              disabled={!manualOfferInput.trim()}
            >
              <LogIn size={18} /> Connect Workspace
            </button>
          </div>
        )}

        {/* Info footer */}
        <div className="mt-8 flex items-center justify-center gap-6 text-[10px] text-muted/50 font-bold uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><Cpu size={12} /> Serverless</span>
          <span className="flex items-center gap-1.5"><Users size={12} /> Peer-to-Peer</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Encrypted</span>
        </div>
      </div>
    </div>
  );
}
