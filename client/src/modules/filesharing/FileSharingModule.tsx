import React, { useState, useEffect, useRef } from "react";
import type { ModuleProps } from "../../core/types";
import { 
  FolderUp, FileDown, CheckCircle2, ShieldAlert, Loader, 
  XCircle, FileText, FileImage, FileAudio, FileVideo, FileCode, Archive, File, Users 
} from "lucide-react";

interface FileMetadata {
  fileId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

interface TransferState {
  fileId: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: "idle" | "sending" | "receiving" | "completed" | "failed";
  direction: "send" | "receive";
  peerId: string;
  downloadUrl?: string;
}

const CHUNK_SIZE = 16384; // 16KB chunks

export default function FileSharingModule({ selfId, peers, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const [transfers, setTransfers] = useState<Record<string, TransferState>>({});
  const [targetPeerId, setTargetPeerId] = useState<string>("all");
  const [dragActive, setDragActive] = useState(false);
  
  const sendingFilesRef = useRef<Record<string, { file: File; totalChunks: number }>>({});
  const receivingChunksRef = useRef<Record<string, { chunks: (string | undefined)[]; meta: FileMetadata; fromPeer: string }>>({});

  useEffect(() => {
    return onModuleEvent((env) => {
      // env.event is the discriminator; env.payload is the data
      const event = env.event;
      const data = env.payload as any;

      // ── Receiver: sender announced a new file ──
      if (event === "file:start") {
        const meta = data as FileMetadata;
        receivingChunksRef.current[meta.fileId] = {
          chunks: new Array(meta.totalChunks).fill(undefined),
          meta,
          fromPeer: env.from
        };

        setTransfers((prev) => ({
          ...prev,
          [meta.fileId]: {
            fileId: meta.fileId,
            name: meta.name,
            size: meta.size,
            type: meta.type,
            progress: 0,
            status: "receiving",
            direction: "receive",
            peerId: env.from
          }
        }));

        // ACK to trigger first chunk
        sendModuleEvent("file:ack", { fileId: meta.fileId, chunkIndex: -1 }, env.from);
      }

      // ── Receiver: got a chunk ──
      else if (event === "file:chunk") {
        const { fileId, chunkIndex, data: chunkData } = data;
        const entry = receivingChunksRef.current[fileId];
        if (!entry) return;

        entry.chunks[chunkIndex] = chunkData;
        const received = entry.chunks.filter((c) => c !== undefined).length;
        const total = entry.meta.totalChunks;
        const progress = Math.round((received / total) * 100);

        setTransfers((prev) => {
          const t = prev[fileId];
          if (!t || t.status === "failed") return prev;
          return {
            ...prev,
            [fileId]: { ...t, progress, status: progress === 100 ? "completed" : "receiving" }
          };
        });

        if (progress === 100) {
          // Reassemble
          try {
            const byteArrays = entry.chunks.map((base64) => {
              const binary = atob(base64!);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              return bytes;
            });
            const blob = new Blob(byteArrays, { type: entry.meta.type || "application/octet-stream" });
            const downloadUrl = URL.createObjectURL(blob);

            setTransfers((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], status: "completed", progress: 100, downloadUrl }
            }));
            delete receivingChunksRef.current[fileId];
          } catch (e) {
            console.error("Failed to reassemble file:", e);
            setTransfers((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], status: "failed" }
            }));
          }
        } else {
          // ACK next chunk
          sendModuleEvent("file:ack", { fileId, chunkIndex }, env.from);
        }
      }

      // ── Sender: receiver ACKed — send next chunk ──
      else if (event === "file:ack") {
        const { fileId, chunkIndex } = data;
        const task = sendingFilesRef.current[fileId];
        if (!task) return;

        const nextChunk = chunkIndex + 1;
        if (nextChunk < task.totalChunks) {
          sendChunk(fileId, nextChunk, env.from);
        } else {
          setTransfers((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], status: "completed", progress: 100 }
          }));
          delete sendingFilesRef.current[fileId];
        }
      }

      // ── Either side: transfer cancelled ──
      else if (event === "file:cancel") {
        const { fileId } = data;
        delete sendingFilesRef.current[fileId];
        delete receivingChunksRef.current[fileId];
        setTransfers((prev) => {
          if (!prev[fileId]) return prev;
          return { ...prev, [fileId]: { ...prev[fileId], status: "failed" } };
        });
      }
    });
  }, [onModuleEvent, sendModuleEvent]);

  const sendChunk = (fileId: string, chunkIdx: number, toPeerId: string) => {
    const task = sendingFilesRef.current[fileId];
    if (!task) return;

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, task.file.size);
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      // Use env.event as discriminator, payload = pure data
      sendModuleEvent("file:chunk", {
        fileId,
        chunkIndex: chunkIdx,
        data: result.split(",")[1] // base64 only
      }, toPeerId);

      const progress = Math.round(((chunkIdx + 1) / task.totalChunks) * 100);
      setTransfers((prev) => {
        if (!prev[fileId] || prev[fileId].status === "failed") return prev;
        return {
          ...prev,
          [fileId]: { ...prev[fileId], progress: Math.min(progress, 99) }
        };
      });
    };

    reader.readAsDataURL(task.file.slice(start, end));
  };

  const startFileTransfer = (file: File) => {
    const activePeers = Array.from(peers.values());
    if (activePeers.length === 0) {
      alert("No peers in the room to share files with!");
      return;
    }

    const targets = targetPeerId === "all"
      ? activePeers
      : activePeers.filter((p) => p.peerId === targetPeerId);

    targets.forEach((peer) => {
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      sendingFilesRef.current[fileId] = { file, totalChunks };

      setTransfers((prev) => ({
        ...prev,
        [fileId]: {
          fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: "sending",
          direction: "send",
          peerId: peer.peerId
        }
      }));

      // Send file metadata as payload — event = "file:start" is the discriminator
      const meta: FileMetadata = { fileId, name: file.name, size: file.size, type: file.type, totalChunks };
      sendModuleEvent("file:start", meta, peer.peerId);
    });
  };

  const cancelTransfer = (fileId: string) => {
    const t = transfers[fileId];
    if (!t) return;
    sendModuleEvent("file:cancel", { fileId }, t.peerId);
    delete sendingFilesRef.current[fileId];
    delete receivingChunksRef.current[fileId];
    setTransfers((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: "failed" }
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startFileTransfer(file);
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
    if (file) startFileTransfer(file);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType: string) => {
    const mt = mimeType?.toLowerCase() ?? "";
    if (mt.startsWith("image/")) return <FileImage className="text-blue-400" size={20} />;
    if (mt.startsWith("video/")) return <FileVideo className="text-purple-400" size={20} />;
    if (mt.startsWith("audio/")) return <FileAudio className="text-emerald-400" size={20} />;
    if (mt.includes("javascript") || mt.includes("typescript") || mt.includes("json") || mt.startsWith("text/html") || mt.startsWith("text/css")) return <FileCode className="text-yellow-400" size={20} />;
    if (mt.startsWith("text/")) return <FileText className="text-gray-300" size={20} />;
    if (mt.includes("zip") || mt.includes("tar") || mt.includes("rar") || mt.includes("gzip") || mt.includes("7z")) return <Archive className="text-orange-400" size={20} />;
    return <File className="text-muted" size={20} />;
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
