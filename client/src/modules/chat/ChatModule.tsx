import { useEffect, useRef, useState } from "react";
import { useWebRTC } from "../../core/WebRTCContext";
import { useFileTransfer } from "../../core/useFileTransfer";
import type { ModuleProps } from "../../core/types";
import RoomChat from "./shared-chat/RoomChat";
import type { ChatMessage } from "./shared-chat/types";

export default function ChatModule({ selfId, selfName, peers, sendModuleEvent, onModuleEvent, isActive = true }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState } = useWebRTC();
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  const { transfers, startFileTransfer, cancelTransfer, requestDownload } = useFileTransfer(
    "chat",
    isActive
  );

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

  const handleSendMessage = (text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: selfId,
      fromName: selfName,
      text: text,
      ts: Date.now(),
    };
    const next = [...messagesRef.current, msg];
    setMessages(next);
    setModuleState("chat", next);
  };

  const handleSendFile = (file: File) => {
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

  return (
    <RoomChat
      selfId={selfId}
      peers={peers}
      messages={messages}
      onSendMessage={handleSendMessage}
      onSendFile={handleSendFile}
      transfers={transfers as any}
      onCancelTransfer={cancelTransfer}
      onStartDownload={requestDownload}
    />
  );
}
