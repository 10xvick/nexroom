import { useState, useEffect, useRef } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { Copy, Plus, LogIn, Loader2, CheckCircle2, ArrowLeft, Link, Code2 } from "lucide-react";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
  return (
    <button onClick={copy} className="btn-ghost gap-1.5 text-xs">
      {copied ? <><CheckCircle2 size={13} className="text-success" /> Copied!</> : <><Copy size={13} /> {label}</>}
    </button>
  );
}

function CodeBox({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted font-medium">{label}</p>
      <div className="relative">
        <textarea readOnly value={code} rows={3}
          className="w-full font-mono text-xs bg-black/40 border border-border rounded-lg px-3 py-2 text-green-400 resize-none focus:outline-none" />
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

  function saveName(n: string) { localStorage.setItem("nexroom_name", n); setName(n); }

  // ── Detect invite URL on mount ───────────────────────────────────────────────
  useEffect(() => {
    // Check manual invite link
    const match = window.location.hash.match(/[#&]i=([^&]+)/);
    if (match) {
      const code = decodeURIComponent(match[1]);
      setPendingOfferCode(code);
      setPendingRoomName("Manual Room Invite");
      setView("join_url");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // Check automatic room code link (#r=ROOMCODE)
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⬡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-sm mt-1">serverless peer-to-peer collaboration</p>
        </div>

        {/* ── Gathering spinner ── */}
        {phase === "gathering" && (
          <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3">
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
          <div className="glass rounded-2xl p-6 space-y-5">
            <p className="text-sm font-semibold text-white">Step 1 — Send this invite link</p>
            <p className="text-xs text-muted">Share the link via any channel. When they open it, their answer code will be generated automatically.</p>

            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-accent/20">
              <Link size={13} className="text-accent shrink-0" />
              <span className="text-xs text-accent truncate flex-1">{url}</span>
              <CopyBtn text={url} label="Copy Link" />
            </div>

            <button
              onClick={() => setShowRawCode(!showRawCode)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
            >
              <Code2 size={12} /> {showRawCode ? "Hide" : "Trouble with link? Use raw code instead"}
            </button>
            {showRawCode && <CodeBox code={myCode} label="Raw invite code" />}

            <hr className="border-border" />
            <p className="text-sm font-semibold text-white">Step 2 — Paste their answer code</p>
            <p className="text-xs text-muted">After they open your link, they'll see an answer code. Paste it here to connect.</p>
            <textarea rows={3} className="w-full font-mono text-xs resize-none"
              placeholder="Paste answer code here…"
              value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} />
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button className="btn-primary w-full justify-center" onClick={handleComplete} disabled={!answerInput.trim()}>
              <CheckCircle2 size={16} /> Connect
            </button>
          </div>
        )}

        {/* ── answer_ready: guest shows answer code or waits for handshake ── */}
        {phase === "answer_ready" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            {signalingMethod === "manual" ? (
              <>
                <p className="text-sm font-semibold text-white">Send this answer code back</p>
                <p className="text-xs text-muted">Copy this and send it back to the person who shared the invite link.</p>
                <CodeBox code={myCode} label="Your answer code" />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <Loader2 size={28} className="text-accent animate-spin" />
                <p className="text-sm text-white font-medium">Connecting automatically...</p>
                <p className="text-xs text-muted">Performing secure handshake with Host using {signalingMethod}.</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted/60 bg-surface/50 rounded-lg px-3 py-2 justify-center">
              <Loader2 size={12} className="animate-spin shrink-0" />
              Waiting for the host to accept…
            </div>
          </div>
        )}

        {/* ── join_url: guest opened invite link, needs name ── */}
        {phase === "idle" && view === "join_url" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <p className="text-sm font-semibold text-white">
              You're invited to join <span className="text-accent">{pendingRoomName}</span>
            </p>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Your Name</label>
              <input type="text" className="w-full" placeholder="Enter your display name"
                value={name} onChange={(e) => saveName(e.target.value)} maxLength={32}
                autoFocus />
            </div>
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button className="btn-primary w-full justify-center"
              onClick={() => { autoStarted.current = true; startGuest(pendingOfferCode, name.trim()); }}
              disabled={!name.trim()}>
              <LogIn size={16} /> Join Room
            </button>
            <button onClick={() => setView("home")} className="text-xs text-muted hover:text-white w-full text-center">← Back</button>
          </div>
        )}

        {/* ── home ── */}
        {phase === "idle" && view === "home" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Your Name</label>
              <input type="text" className="w-full" placeholder="Enter your display name"
                value={name} onChange={(e) => saveName(e.target.value)} maxLength={32} />
            </div>
            <hr className="border-border" />
            <button className="btn-primary w-full justify-center" onClick={() => setView("create")} disabled={!name.trim()}>
              <Plus size={16} /> Create Room
            </button>
            <button className="btn-ghost w-full justify-center border-accent/30 text-accent hover:bg-accent/10"
              onClick={() => setView("join_manual")} disabled={!name.trim()}>
              <Code2 size={16} /> Join Room / Code
            </button>
          </div>
        )}

        {/* ── create ── */}
        {phase === "idle" && view === "create" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setView("home")} className="text-muted hover:text-white"><ArrowLeft size={16} /></button>
              <p className="text-sm font-semibold text-white">Create a Room</p>
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Room Name</label>
              <input type="text" className="w-full" placeholder={`${name.trim()}'s Room`}
                value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
            <p className="text-xs text-muted">A room code or manual link will be generated automatically to share with your peer.</p>
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button className="btn-primary w-full justify-center" onClick={handleCreate}>
              <Plus size={16} /> Create Room
            </button>
          </div>
        )}

        {/* ── join manual (supports 6-character room codes AND base64 manual strings) ── */}
        {phase === "idle" && view === "join_manual" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setView("home")} className="text-muted hover:text-white"><ArrowLeft size={16} /></button>
              <p className="text-sm font-semibold text-white">Join a Room</p>
            </div>
            <p className="text-xs text-muted">Enter a 6-character Room Code, or paste a manual invite code if using offline fallback.</p>
            <textarea rows={5} className="w-full font-mono text-xs resize-none"
              placeholder="Paste Room Code (e.g. A3B89C) or manual invite string here…"
              value={manualOfferInput} onChange={(e) => setManualOfferInput(e.target.value)} />
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button className="btn-primary w-full justify-center" onClick={handleJoin} disabled={!manualOfferInput.trim()}>
              <LogIn size={16} /> Connect
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted/50 mt-6">
          100% serverless · peer-to-peer via WebRTC + STUN
        </p>
      </div>
    </div>
  );
}
