import { useState, useEffect, useRef, useCallback } from "react";
import { useWebRTC } from "./WebRTCContext";
import type { ModuleEventEnvelope } from "./types";

export interface FileMetadata {
  fileId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

export interface FileTransferState {
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

export function useFileTransfer(
  moduleId: string,
  onTransferUpdate?: (fileId: string, update: Partial<FileTransferState>) => void
) {
  const { peers, sendModuleEvent, onModuleEvent } = useWebRTC();
  const [transfers, setTransfers] = useState<Record<string, FileTransferState>>({});

  const sendingFilesRef = useRef<Record<string, { file: File; totalChunks: number }>>({});
  const receivingChunksRef = useRef<Record<string, { chunks: (string | undefined)[]; meta: FileMetadata; fromPeer: string }>>({});

  const updateTransfer = useCallback((fileId: string, update: Partial<FileTransferState>) => {
    console.log(`[useFileTransfer:${moduleId}] updating transfer ${fileId}`, update);
    setTransfers((prev) => {
      const existing = prev[fileId] || {};
      return {
        ...prev,
        [fileId]: { ...existing, ...update } as FileTransferState,
      };
    });
    if (onTransferUpdate) {
      onTransferUpdate(fileId, update);
    }
  }, [moduleId, onTransferUpdate]);

  const sendChunk = useCallback((fileId: string, chunkIdx: number, toPeerId: string) => {
    const task = sendingFilesRef.current[fileId];
    if (!task) {
      console.warn(`[useFileTransfer:${moduleId}] sendChunk: task not found for ${fileId}`);
      return;
    }

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, task.file.size);
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      console.log(`[useFileTransfer:${moduleId}] Sending chunk ${chunkIdx}/${task.totalChunks - 1} for ${fileId} to ${toPeerId}`);
      sendModuleEvent(
        moduleId,
        "file:chunk",
        {
          fileId,
          chunkIndex: chunkIdx,
          data: result.split(",")[1], // base64 only
        },
        toPeerId
      );

      const progress = Math.round(((chunkIdx + 1) / task.totalChunks) * 100);
      updateTransfer(fileId, { progress: Math.min(progress, 99) });
    };

    reader.readAsDataURL(task.file.slice(start, end));
  }, [moduleId, sendModuleEvent, updateTransfer]);

  useEffect(() => {
    console.log(`[useFileTransfer:${moduleId}] Registering module event handler`);
    return onModuleEvent((env) => {
      if (env.moduleId !== moduleId) return;

      const event = env.event;
      const data = env.payload as any;

      console.log(`[useFileTransfer:${moduleId}] Received event: ${event} from ${env.from}`, data);

      if (event === "file:start") {
        const meta = data as FileMetadata;
        receivingChunksRef.current[meta.fileId] = {
          chunks: new Array(meta.totalChunks).fill(undefined),
          meta,
          fromPeer: env.from,
        };

        const newTransfer: FileTransferState = {
          fileId: meta.fileId,
          name: meta.name,
          size: meta.size,
          type: meta.type,
          progress: 0,
          status: "receiving",
          direction: "receive",
          peerId: env.from,
        };

        setTransfers((prev) => ({
          ...prev,
          [meta.fileId]: newTransfer,
        }));
        if (onTransferUpdate) {
          onTransferUpdate(meta.fileId, newTransfer);
        }

        console.log(`[useFileTransfer:${moduleId}] Acknowledging file:start for ${meta.fileId}`);
        // ACK to trigger first chunk
        sendModuleEvent(moduleId, "file:ack", { fileId: meta.fileId, chunkIndex: -1 }, env.from);
      }

      else if (event === "file:chunk") {
        const { fileId, chunkIndex, data: chunkData } = data;
        const entry = receivingChunksRef.current[fileId];
        if (!entry) {
          console.warn(`[useFileTransfer:${moduleId}] Received chunk for unknown fileId: ${fileId}`);
          return;
        }

        entry.chunks[chunkIndex] = chunkData;
        const received = entry.chunks.filter((c) => c !== undefined).length;
        const total = entry.meta.totalChunks;
        const progress = Math.round((received / total) * 100);

        const status = progress === 100 ? "completed" : "receiving";
        updateTransfer(fileId, { progress, status });

        if (progress === 100) {
          console.log(`[useFileTransfer:${moduleId}] File reassembly starting for ${fileId}`);
          try {
            const byteArrays = entry.chunks.map((base64) => {
              const binary = atob(base64!);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              return bytes;
            });
            const blob = new Blob(byteArrays, { type: entry.meta.type || "application/octet-stream" });
            const downloadUrl = URL.createObjectURL(blob);

            updateTransfer(fileId, { status: "completed", progress: 100, downloadUrl });
            delete receivingChunksRef.current[fileId];
            console.log(`[useFileTransfer:${moduleId}] File reassembled successfully for ${fileId}`);
          } catch (e) {
            console.error("Failed to reassemble file:", e);
            updateTransfer(fileId, { status: "failed" });
          }
        } else {
          // ACK next chunk
          sendModuleEvent(moduleId, "file:ack", { fileId, chunkIndex }, env.from);
        }
      }

      else if (event === "file:ack") {
        const { fileId, chunkIndex } = data;
        const task = sendingFilesRef.current[fileId];
        if (!task) {
          console.warn(`[useFileTransfer:${moduleId}] Received ACK for unknown fileId: ${fileId}`);
          return;
        }

        const nextChunk = chunkIndex + 1;
        if (nextChunk < task.totalChunks) {
          sendChunk(fileId, nextChunk, env.from);
        } else {
          console.log(`[useFileTransfer:${moduleId}] Transfer completed for ${fileId}`);
          updateTransfer(fileId, { status: "completed", progress: 100 });
          delete sendingFilesRef.current[fileId];
        }
      }

      else if (event === "file:cancel") {
        const { fileId } = data;
        delete sendingFilesRef.current[fileId];
        delete receivingChunksRef.current[fileId];
        updateTransfer(fileId, { status: "failed" });
      }
    });
  }, [moduleId, onModuleEvent, sendModuleEvent, sendChunk, updateTransfer, onTransferUpdate]);

  const startFileTransfer = useCallback((file: File, targetPeerId: string) => {
    const activePeers = Array.from(peers.values());
    console.log(`[useFileTransfer:${moduleId}] startFileTransfer for ${file.name}, peers:`, activePeers.map(p => p.peerId));
    if (activePeers.length === 0) {
      alert("No peers in the room to share files with!");
      return null;
    }

    const targets = targetPeerId === "all"
      ? activePeers
      : activePeers.filter((p) => p.peerId === targetPeerId);

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    sendingFilesRef.current[fileId] = { file, totalChunks };

    setTransfers((prev) => {
      const next = { ...prev };
      targets.forEach((peer) => {
        next[fileId] = {
          fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: "sending",
          direction: "send",
          peerId: peer.peerId,
        };
      });
      return next;
    });

    targets.forEach((peer) => {
      if (onTransferUpdate) {
        onTransferUpdate(fileId, {
          fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: "sending",
          direction: "send",
          peerId: peer.peerId,
        });
      }

      const meta: FileMetadata = { fileId, name: file.name, size: file.size, type: file.type, totalChunks };
      console.log(`[useFileTransfer:${moduleId}] Sending file:start for ${fileId} to ${peer.peerId}`);
      sendModuleEvent(moduleId, "file:start", meta, peer.peerId);
    });

    return fileId;
  }, [peers, moduleId, sendModuleEvent, onTransferUpdate]);

  const cancelTransfer = useCallback((fileId: string) => {
    const t = transfers[fileId];
    if (!t) return;
    sendModuleEvent(moduleId, "file:cancel", { fileId }, t.peerId);
    delete sendingFilesRef.current[fileId];
    delete receivingChunksRef.current[fileId];
    updateTransfer(fileId, { status: "failed" });
  }, [transfers, sendModuleEvent, moduleId, updateTransfer]);

  return {
    transfers,
    setTransfers,
    startFileTransfer,
    cancelTransfer,
  };
}
