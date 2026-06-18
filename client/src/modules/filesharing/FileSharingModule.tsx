import React, { useState } from "react";
import type { ModuleProps } from "../../core/types";
import { useFileTransfer } from "../../core/useFileTransfer";
import { formatSize, getFileIcon } from "shared-chat";
import { 
  FolderUp, FileDown, CheckCircle2, ShieldAlert, Loader, 
  XCircle, Users 
} from "lucide-react";

export default function FileSharingModule({ selfId, peers }: ModuleProps) {
  const [targetPeerId, setTargetPeerId] = useState<string>("all");
  const [dragActive, setDragActive] = useState(false);
  
  const { transfers, startFileTransfer, cancelTransfer } = useFileTransfer("filesharing");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startFileTransfer(file, targetPeerId);
    e.target.value = ""; // reset so same file can be picked again
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) startFileTransfer(file, targetPeerId);
  };



  const getPeerName = (id: string) => peers.get(id)?.peerName ?? id.slice(0, 8);
  const peerList = Array.from(peers.values());

  return (
    <div className="flex flex-col h-full gap-5 p-6 overflow-y-auto bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderUp size={24} className="text-accent" />
          <h2 className="text-lg font-bold text-white">P2P File Share</h2>
        </div>

        {peerList.length > 0 && (
          <div className="flex items-center gap-2 bg-surface/40 border border-border/40 rounded-xl px-2.5 py-1.5">
            <Users size={12} className="text-muted" />
            <span className="text-[10px] text-muted font-bold uppercase tracking-wider">To:</span>
            <select
              value={targetPeerId}
              onChange={(e) => setTargetPeerId(e.target.value)}
              className="bg-transparent text-xs text-white border-none outline-none font-semibold cursor-pointer"
            >
              <option value="all" className="bg-[#1a1b1e]">All Peers</option>
              {peerList.map((p) => (
                <option key={p.peerId} value={p.peerId} className="bg-[#1a1b1e]">
                  {p.peerName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all flex flex-col items-center justify-center gap-3 ${
          dragActive
            ? "border-accent bg-accent/5 scale-[0.99] shadow-[0_0_24px_rgba(var(--accent-rgb),0.2)]"
            : "border-border/40 hover:border-accent/40 bg-surface/10"
        }`}
      >
        <FolderUp
          size={48}
          className={`transition-colors mb-1 ${dragActive ? "text-accent" : "text-accent/50"}`}
        />
        <div>
          <p className="text-sm font-semibold text-white">
            {dragActive ? "Drop to share!" : "Drag & drop or browse a file"}
          </p>
          <p className="text-xs text-muted mt-1">
            End-to-end P2P via WebRTC DataChannel — never hits a server
          </p>
        </div>
        <input
          type="file"
          id="file-upload"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={handleFileSelect}
        />
        <label
          htmlFor="file-upload"
          className="btn-primary py-2 px-5 text-xs font-semibold cursor-pointer pointer-events-none mt-1"
        >
          Choose File
        </label>
      </div>

      {/* Transfer List */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Transfers</h3>
        {Object.values(transfers).length === 0 ? (
          <p className="text-xs text-muted/50 italic">No transfers yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.values(transfers).map((t) => (
              <div
                key={t.fileId}
                className="bg-surface/30 border border-border/30 rounded-xl p-4 flex flex-col gap-2.5"
              >
                {/* Row 1: icon + name + status badge */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-1.5 bg-surface rounded-lg border border-border/20 shrink-0">
                      {getFileIcon(t.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {formatSize(t.size)} &bull;{" "}
                        {t.direction === "send"
                          ? `→ ${getPeerName(t.peerId)}`
                          : `← ${getPeerName(t.peerId)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {t.status === "sending" && (
                      <span className="text-[10px] bg-accent/20 border border-accent/40 text-accent font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Loader size={9} className="animate-spin" /> Sending
                      </span>
                    )}
                    {t.status === "receiving" && (
                      <span className="text-[10px] bg-warn/20 border border-warn/40 text-warn font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Loader size={9} className="animate-spin" /> Receiving
                      </span>
                    )}
                    {t.status === "completed" && (
                      <span className="text-[10px] bg-success/20 border border-success/40 text-success font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={9} /> Done
                      </span>
                    )}
                    {t.status === "failed" && (
                      <span className="text-[10px] bg-danger/20 border border-danger/40 text-danger font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldAlert size={9} /> Cancelled
                      </span>
                    )}

                    {(t.status === "sending" || t.status === "receiving") && (
                      <button
                        onClick={() => cancelTransfer(t.fileId)}
                        className="text-muted hover:text-danger transition-colors ml-1"
                        title="Cancel transfer"
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {(t.status === "sending" || t.status === "receiving") && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>Progress</span>
                      <span>{t.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-200"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download button */}
                {t.status === "completed" && t.direction === "receive" && t.downloadUrl && (
                  <a
                    href={t.downloadUrl}
                    download={t.name}
                    className="btn-primary py-2 px-4 text-xs w-fit gap-1.5 flex items-center mt-1"
                  >
                    <FileDown size={14} /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
