import React, { useState, useEffect, useRef } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { FolderUp, FileDown, CheckCircle2, ShieldAlert, ArrowRight, Loader } from "lucide-react";

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
  downloadUrl?: string;
}

const CHUNK_SIZE = 16384; // 16KB chunks

export default function FileSharingModule({ selfId, peers, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const [transfers, setTransfers] = useState<Record<string, TransferState>>({});
  
  // Refs for tracking files and chunks currently being processed
  const sendingFilesRef = useRef<Record<string, { file: File; currentChunk: number; totalChunks: number }>>({});
  const receivingChunksRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    return onModuleEvent((env) => {
      if (env.moduleId !== "filesharing") return;
      const msg = env.payload as any;

      if (msg.type === "file:start") {
        const meta = msg.meta as FileMetadata;
        // Initialize receiver storage
        receivingChunksRef.current[meta.fileId] = new Array(meta.totalChunks);
        
        setTransfers((prev) => ({
          ...prev,
          [meta.fileId]: {
            fileId: meta.fileId,
            name: meta.name,
            size: meta.size,
            type: meta.type,
            progress: 0,
            status: "receiving",
            direction: "receive"
          }
        }));

        // Send back an ACK to start chunk transmission
        sendModuleEvent("file:ack", { fileId: meta.fileId, chunkIndex: -1 }, env.from);
      }

      else if (msg.type === "file:chunk") {
        const { fileId, chunkIndex, data } = msg;
        const chunkList = receivingChunksRef.current[fileId];
        if (!chunkList) return;

        chunkList[chunkIndex] = data;
        const total = chunkList.length;
        const received = chunkList.filter((c) => c !== undefined).length;
        const progress = Math.round((received / total) * 100);

        setTransfers((prev) => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            progress,
            status: progress === 100 ? "completed" : "receiving"
          }
        }));

        if (progress === 100) {
          // Reassemble file
          try {
            const byteArrays = chunkList.map((base64) => {
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              return bytes;
            });
            const blob = new Blob(byteArrays, { type: transfers[fileId]?.type || "application/octet-stream" });
            const downloadUrl = URL.createObjectURL(blob);

            setTransfers((prev) => ({
              ...prev,
              [fileId]: {
                ...prev[fileId],
                status: "completed",
                progress: 100,
                downloadUrl
              }
            }));
          } catch (e) {
            console.error("Failed to reassemble file:", e);
            setTransfers((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], status: "failed" }
            }));
          }
        } else {
          // Send ACK for next chunk
          sendModuleEvent("file:ack", { fileId, chunkIndex }, env.from);
        }
      }

      else if (msg.type === "file:ack") {
        const { fileId, chunkIndex } = msg;
        const task = sendingFilesRef.current[fileId];
        if (!task) return;

        const nextChunk = chunkIndex + 1;
        if (nextChunk < task.totalChunks) {
          task.currentChunk = nextChunk;
          sendChunk(fileId, nextChunk, env.from);
        } else {
          // Send finished
          setTransfers((prev) => ({
            ...prev,
            [fileId]: {
              ...prev[fileId],
              status: "completed",
              progress: 100
            }
          }));
          delete sendingFilesRef.current[fileId];
        }
      }
    });
  }, [onModuleEvent, sendModuleEvent, transfers]);

  const sendChunk = (fileId: string, chunkIdx: number, toPeerId: string) => {
    const task = sendingFilesRef.current[fileId];
    if (!task) return;

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, task.file.size);
    const blobSlice = task.file.slice(start, end);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;
      const base64Data = result.split(",")[1]; // strip header

      sendModuleEvent("file:chunk", {
        fileId,
        chunkIndex: chunkIdx,
        data: base64Data
      }, toPeerId);

      const progress = Math.round(((chunkIdx + 1) / task.totalChunks) * 100);
      setTransfers((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          progress: Math.min(progress, 99) // don't show 100 until receiver ACK completes
        }
      }));
    };
    reader.readAsDataURL(blobSlice);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Send to first active peer in the room
    const targetPeer = Array.from(peers.values())[0];
    if (!targetPeer) {
      alert("No peers in the room to share files with!");
      return;
    }

    const fileId = Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    sendingFilesRef.current[fileId] = {
      file,
      currentChunk: 0,
      totalChunks
    };

    setTransfers((prev) => ({
      ...prev,
      [fileId]: {
        fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "sending",
        direction: "send"
      }
    }));

    // Start signaling file metadata
    sendModuleEvent("file:start", {
      meta: {
        fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunks
      }
    }, targetPeer.peerId);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="flex flex-col h-full gap-5 p-6 max-h-screen overflow-y-auto bg-bg">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FolderUp size={24} className="text-accent" />
        <h2 className="text-lg font-bold text-white">P2P File Share</h2>
      </div>

      {/* Share Box */}
      <div className="border border-dashed border-border/40 hover:border-accent/40 rounded-2xl p-8 bg-surface/10 text-center transition-colors relative flex flex-col items-center justify-center gap-3">
        <FolderUp size={48} className="text-accent/60 mb-2" />
        <div>
          <p className="text-sm font-semibold text-white">Share a file with peers</p>
          <p className="text-xs text-muted mt-1">Transferred directly over WebRTC DataChannel (P2P)</p>
        </div>
        <input
          type="file"
          id="file-upload"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={handleFileSelect}
        />
        <label htmlFor="file-upload" className="btn-primary py-2 px-4 text-xs font-semibold cursor-pointer pointer-events-none mt-2">
          Choose File
        </label>
      </div>

      {/* Transfer Lists */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Transfers</h3>
        {Object.values(transfers).length === 0 ? (
          <p className="text-xs text-muted/60 italic">No transfers yet.</p>
        ) : (
          <div className="space-y-3.5">
            {Object.values(transfers).map((t) => (
              <div key={t.fileId} className="bg-surface/30 border border-border/30 rounded-xl p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-xs text-muted mt-0.5">{formatSize(t.size)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === "sending" && (
                      <span className="text-[10px] bg-accent/25 border border-accent/40 text-accent font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5">
                        <Loader size={10} className="animate-spin" /> Sending
                      </span>
                    )}
                    {t.status === "receiving" && (
                      <span className="text-[10px] bg-warn/25 border border-warn/40 text-warn font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5">
                        <Loader size={10} className="animate-spin" /> Receiving
                      </span>
                    )}
                    {t.status === "completed" && (
                      <span className="text-[10px] bg-success/25 border border-success/40 text-success font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} /> Done
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {t.status !== "completed" && t.status !== "failed" && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>Progress</span>
                      <span>{t.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-border/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-150"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download links */}
                {t.status === "completed" && t.direction === "receive" && t.downloadUrl && (
                  <a
                    href={t.downloadUrl}
                    download={t.name}
                    className="btn-primary py-2 px-3 text-xs w-fit justify-center gap-1.5 text-white font-semibold flex items-center mt-1"
                  >
                    <FileDown size={14} /> Download File
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
