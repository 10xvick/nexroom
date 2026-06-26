import type { ComponentType } from "react";

export interface Peer {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  peers: Peer[];
}

export interface SignalEnvelope {
  from: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface ModuleEventEnvelope {
  moduleId: string;
  event: string;
  payload: unknown;
  from: string;
}

export interface FileMetadata {
  fileId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

export interface FileTransferState {
  fileId: string;
  moduleId: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: "idle" | "sending" | "receiving" | "completed" | "failed";
  direction: "send" | "receive";
  peerId: string;
  downloadUrl?: string;
}

// ─── Module Registry ──────────────────────────────────────────────────────────

export interface NexModule {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  component: ComponentType<ModuleProps>;
  /** optional: called when module becomes active */
  onActivate?: () => void;
  /** optional: called when module is deactivated */
  onDeactivate?: () => void;
}

export interface ModuleProps {
  room: Room;
  selfId: string;
  selfName: string;
  peers: Map<string, PeerConnection>;
  isActive?: boolean;
  sendModuleEvent: (event: string, payload: unknown, to?: string) => void;
  onModuleEvent: (handler: (env: ModuleEventEnvelope) => void) => () => void;
}

// ─── WebRTC ───────────────────────────────────────────────────────────────────

export interface PeerConnection {
  peerId: string;
  peerName: string;
  pc: RTCPeerConnection;
  dataChannels: Map<string, RTCDataChannel>;
  stream?: MediaStream;
  reconnecting?: boolean;
}
