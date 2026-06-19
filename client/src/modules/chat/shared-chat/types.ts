export interface ChatMessage {
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

export interface FileTransferState {
  status: "idle" | "sending" | "receiving" | "completed" | "failed";
  progress: number;
  downloadUrl?: string;
}

export interface RoomChatProps {
  selfId: string;
  selfName?: string;
  peers: Map<string, { peerName: string }> | any;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendFile?: (file: File) => void;
  transfers?: Record<string, FileTransferState>;
  onCancelTransfer?: (fileId: string) => void;
  onStartDownload?: (fileId: string) => void;
}


