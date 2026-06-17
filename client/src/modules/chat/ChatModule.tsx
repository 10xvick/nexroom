import { useEffect, useRef, useState } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Send } from "lucide-react";

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
}

export default function ChatModule({ selfId, selfName, peers, onModuleEvent }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState } = useWebRTC();
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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

  function peerName(id: string) {
    return peers.get(id)?.peerName || id.slice(0, 8);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-muted text-sm text-center mt-8">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const isSelf = m.from === selfId;
          return (
            <div key={m.id} className={`flex flex-col gap-0.5 ${isSelf ? "items-end" : "items-start"}`}>
              <span className="text-xs text-muted">
                {isSelf ? "You" : m.fromName || peerName(m.from)}
              </span>
              <div
                className={`max-w-xs px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  isSelf
                    ? "bg-accent text-white rounded-br-sm"
                    : "bg-surface border border-border text-white rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
              <span className="text-[10px] text-muted/60">
                {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <input
          type="text"
          className="flex-1"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary px-3" onClick={send}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
