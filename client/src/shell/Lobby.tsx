import { useState } from "react";
import { useWebRTC } from "../core/WebRTCContext";
import { Copy, Plus, LogIn, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

function CodeBox({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted font-medium">{label}</p>
      <div className="relative">
        <textarea
          readOnly
          value={code}
          rows={4}
          className="w-full font-mono text-xs bg-black/40 border border-border rounded-lg px-3 py-2 text-green-400 resize-none focus:outline-none"
        />
        <button
          onClick={copy}
          className="absolute top-2 right-2 text-muted hover:text-white transition-colors bg-surface/80 rounded px-1.5 py-0.5 text-xs flex items-center gap-1"
        >
          {copied ? <><CheckCircle2 size={11} className="text-success" /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
    </div>
  );
}

export default function Lobby() {
  const { phase, myCode, gatherError, startHost, startGuest, completeHandshake } = useWebRTC();

  const [name, setName] = useState(localStorage.getItem("nexroom_name") || "");
  const [roomName, setRoomName] = useState("");
  const [offerInput, setOfferInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [view, setView] = useState<"home" | "create" | "join">("home");

  function saveName(n: string) {
    localStorage.setItem("nexroom_name", n);
    setName(n);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    await startHost(name.trim(), roomName.trim() || `${name.trim()}'s Room`);
  }

  async function handleJoin() {
    if (!name.trim() || !offerInput.trim()) return;
    await startGuest(offerInput.trim(), name.trim());
  }

  async function handleComplete() {
    if (!answerInput.trim()) return;
    await completeHandshake(answerInput.trim());
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⬡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">nexroom</h1>
          <p className="text-muted text-sm mt-1">serverless peer-to-peer collaboration</p>
        </div>

        {/* ── Gathering spinner ── */}
        {phase === "gathering" && (
          <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-accent animate-spin" />
            <p className="text-sm text-white font-medium">Gathering connection info…</p>
            <p className="text-xs text-muted text-center">STUN servers are discovering your network path. Takes 2–8 seconds.</p>
          </div>
        )}

        {/* ── offer_ready: host shares invite, waits for answer ── */}
        {phase === "offer_ready" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setView("home")} className="text-muted hover:text-white"><ArrowLeft size={16} /></button>
              <p className="text-sm font-semibold text-white">Step 1 — Share your invite code</p>
            </div>
            <p className="text-xs text-muted">Send this code to your peer via any channel (chat, email, etc.).</p>
            <CodeBox code={myCode} label="Your invite code" />

            <hr className="border-border" />
            <p className="text-sm font-semibold text-white">Step 2 — Paste their answer code</p>
            <p className="text-xs text-muted">After they paste your invite, they'll get an answer code. Paste it below.</p>
            <textarea
              rows={4}
              className="w-full font-mono text-xs resize-none"
              placeholder="Paste answer code here…"
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
        )}

        {/* ── answer_ready: guest shares answer, waits passively ── */}
        {phase === "answer_ready" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <p className="text-sm font-semibold text-white">Send this answer code back</p>
            <p className="text-xs text-muted">Copy this and send it to the person who gave you the invite code. The connection will complete automatically once they paste it.</p>
            <CodeBox code={myCode} label="Your answer code" />
            <div className="flex items-center gap-2 text-xs text-muted/60 bg-surface/50 rounded-lg px-3 py-2">
              <Loader2 size={12} className="animate-spin shrink-0" />
              Waiting for the other side to accept…
            </div>
          </div>
        )}

        {/* ── idle / home ── */}
        {phase === "idle" && view === "home" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Your Name</label>
              <input
                type="text"
                className="w-full"
                placeholder="Enter your display name"
                value={name}
                onChange={(e) => saveName(e.target.value)}
                maxLength={32}
              />
            </div>
            <hr className="border-border" />
            <button
              className="btn-primary w-full justify-center"
              onClick={() => setView("create")}
              disabled={!name.trim()}
            >
              <Plus size={16} /> Create Room
            </button>
            <button
              className="btn-ghost w-full justify-center border-accent/30 text-accent hover:bg-accent/10"
              onClick={() => setView("join")}
              disabled={!name.trim()}
            >
              <LogIn size={16} /> Join with Invite Code
            </button>
          </div>
        )}

        {/* ── create view ── */}
        {phase === "idle" && view === "create" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setView("home")} className="text-muted hover:text-white"><ArrowLeft size={16} /></button>
              <p className="text-sm font-semibold text-white">Create a Room</p>
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Room Name</label>
              <input
                type="text"
                className="w-full"
                placeholder={`${name.trim()}'s Room`}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted">An invite code will be generated — share it with anyone you want to connect with.</p>
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button className="btn-primary w-full justify-center" onClick={handleCreate}>
              <Plus size={16} /> Generate Invite Code
            </button>
          </div>
        )}

        {/* ── join view ── */}
        {phase === "idle" && view === "join" && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setView("home")} className="text-muted hover:text-white"><ArrowLeft size={16} /></button>
              <p className="text-sm font-semibold text-white">Join with Invite Code</p>
            </div>
            <p className="text-xs text-muted">Paste the invite code you received from the room host.</p>
            <textarea
              rows={5}
              className="w-full font-mono text-xs resize-none"
              placeholder="Paste invite code here…"
              value={offerInput}
              onChange={(e) => setOfferInput(e.target.value)}
            />
            {gatherError && <p className="text-xs text-danger">{gatherError}</p>}
            <button
              className="btn-primary w-full justify-center"
              onClick={handleJoin}
              disabled={!offerInput.trim()}
            >
              <LogIn size={16} /> Generate Answer
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted/50 mt-6">
          100% serverless · end-to-end peer-to-peer via WebRTC + STUN
        </p>
      </div>
    </div>
  );
}
