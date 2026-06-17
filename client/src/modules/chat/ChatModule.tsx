import { useEffect, useRef, useState } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import { useFileTransfer } from "../../core/useFileTransfer";
import type { ModuleProps } from "../../core/types";
import { 
  Send, Paperclip, FileDown, CheckCircle2, ShieldAlert, Loader, 
  XCircle, FileText, FileImage, FileAudio, FileVideo, FileCode, Archive, File 
} from "lucide-react";

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
}

export default function ChatModule({ selfId, selfName, peers, onModuleEvent }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState } = useWebRTC();
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { transfers, startFileTransfer, cancelTransfer } = useFileTransfer("chat");

  function setMessages(msgs: ChatMessage[]) {
    setMessagesState(msgs);
    messagesRef.current = msgs;
  }

  useEffect(() => {
    // Load initial cached state
    const cached = getModuleState("chat");
    if (cached) {
      setMessages(cached);
    }

    // Request latest state from peers
    syncModuleState("chat");

    return onModuleEvent((env) => {
      if (env.moduleId !== "chat") return;
      if (env.event === "state:sync") {
        setMessages(env.payload as ChatMessage[]);
      }
    });
  }, [onModuleEvent, getModuleState, syncModuleState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!input.trim()) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: selfId,
      fromName: selfName,
      text: input.trim(),
      ts: Date.now(),
    };
    const next = [...messagesRef.current, msg];
    setMessages(next);
    setModuleState("chat", next);
    setInput("");
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sendFile(file);
    e.target.value = "";
  };

  const sendFile = (file: File) => {
    const fileId = startFileTransfer(file, "all");
    if (!fileId) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: selfId,
      fromName: selfName,
      text: "",
      ts: Date.now(),
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    };
    const next = [...messagesRef.current, msg];
    setMessages(next);
    setModuleState("chat", next);
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
    if (file) sendFile(file);
  };

  function peerName(id: string) {
    return peers.get(id)?.peerName || id.slice(0, 8);
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType?: string) => {
    const mt = mimeType?.toLowerCase() ?? "";
    if (mt.startsWith("image/")) return <FileImage className="text-blue-400" size={20} />;
    if (mt.startsWith("video/")) return <FileVideo className="text-purple-400" size={20} />;
    if (mt.startsWith("audio/")) return <FileAudio className="text-emerald-400" size={20} />;
    if (mt.includes("javascript") || mt.includes("typescript") || mt.includes("json") || mt.startsWith("text/html") || mt.startsWith("text/css")) return <FileCode className="text-yellow-400" size={20} />;
    if (mt.startsWith("text/")) return <FileText className="text-gray-300" size={20} />;
    if (mt.includes("zip") || mt.includes("tar") || mt.includes("rar") || mt.includes("gzip") || mt.includes("7z")) return <Archive className="text-orange-400" size={20} />;
    return <File className="text-muted" size={20} />;
  };

  return (
    <div 
      className="flex flex-col h-full relative"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 bg-accent/10 border-2 border-dashed border-accent z-50 flex items-center justify-center pointer-events-none backdrop-blur-sm">
          <div className="glass px-6 py-4 rounded-2xl border border-border flex items-center gap-3">
            <Paperclip className="text-accent animate-bounce" size={24} />
            <span className="text-sm font-semibold text-white">Drop files here to share in chat</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-muted text-sm text-center mt-8">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const isSelf = m.from === selfId;
          const transfer = m.fileId ? transfers[m.fileId] : undefined;

          // Resolve status, progress and download url from local transfer state or fallback
          const status = transfer?.status || (m.fileId ? (isSelf ? "sending" : "receiving") : "idle");
          const progress = transfer?.progress ?? 0;
          const downloadUrl = transfer?.downloadUrl;

          return (
            <div key={m.id} className={`flex flex-col gap-0.5 ${isSelf ? "items-end" : "items-start"}`}>
              <span className="text-xs text-muted">
                {isSelf ? "You" : m.fromName || peerName(m.from)}
              </span>
              
              <div
                className={`max-w-xs rounded-2xl text-sm leading-relaxed ${
                  isSelf
                    ? "bg-accent text-white rounded-br-sm"
                    : "bg-surface border border-border text-white rounded-bl-sm"
                } ${m.fileId ? "p-3 w-72" : "px-3 py-2"}`}
              >
                {m.fileId ? (
                  <div className="flex flex-col gap-2.5">
                    {/* Media Previews */}
                    {status === "completed" && downloadUrl && m.fileType?.startsWith("image/") && (
                      <div className="rounded-lg overflow-hidden border border-white/10 max-h-48 flex items-center justify-center bg-black/25">
                        <img src={downloadUrl} alt={m.fileName} className="object-contain max-h-48 w-full" />
                      </div>
                    )}
                    {status === "completed" && downloadUrl && m.fileType?.startsWith("video/") && (
                      <div className="rounded-lg overflow-hidden border border-white/10 max-h-48 flex items-center justify-center bg-black/25">
                        <video src={downloadUrl} controls className="object-contain max-h-48 w-full" />
                      </div>
                    )}
                    {status === "completed" && downloadUrl && m.fileType?.startsWith("audio/") && (
                      <audio src={downloadUrl} controls className="w-full h-8" />
                    )}

                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 bg-black/20 rounded-lg shrink-0">
                        {getFileIcon(m.fileType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate text-white">{m.fileName}</p>
                        <p className="text-[10px] text-white/70 mt-0.5">{formatSize(m.fileSize)}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {status === "sending" && (
                          <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Loader size={8} className="animate-spin" /> Sending
                          </span>
                        )}
                        {status === "receiving" && (
                          <span className="text-[10px] bg-warn/20 text-warn px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Loader size={8} className="animate-spin" /> Recv
                          </span>
                        )}
                        {status === "completed" && (
                          <span className="text-[10px] bg-success/20 text-success px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={8} /> Done
                          </span>
                        )}
                        {status === "failed" && (
                          <span className="text-[10px] bg-danger/20 text-danger px-2 py-0.5 rounded-full flex items-center gap-1">
                            <ShieldAlert size={8} /> Error
                          </span>
                        )}

                        {(status === "sending" || status === "receiving") && m.fileId && (
                          <button
                            onClick={() => cancelTransfer(m.fileId!)}
                            className="text-white/60 hover:text-danger transition-colors ml-1"
                            title="Cancel transfer"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(status === "sending" || status === "receiving") && (
                      <div className="space-y-1">
                        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-200"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Download Link */}
                    {status === "completed" && !isSelf && downloadUrl && (
                      <a
                        href={downloadUrl}
                        download={m.fileName}
                        className="bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg text-xs w-full justify-center gap-1.5 flex items-center transition-colors font-medium mt-0.5"
                      >
                        <FileDown size={13} /> Download
                      </a>
                    )}
                  </div>
                ) : (
                  m.text
                )}
              </div>
              
              <span className="text-[10px] text-muted/60">
                {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border flex gap-2 items-center">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
        <button 
          className="btn-ghost p-2 text-muted hover:text-white shrink-0 rounded-xl"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <input
          type="text"
          className="flex-1"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary px-3 shrink-0" onClick={send}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
