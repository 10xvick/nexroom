import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ModuleEventEnvelope, PeerConnection, Room } from "./types";
import { useSocket, useSocketEvent } from "./SocketContext";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface WebRTCCtx {
  room: Room | null;
  selfId: string;
  selfName: string;
  peers: Map<string, PeerConnection>;
  localStream: MediaStream | null;
  joinRoom: (roomId: string, roomName: string, peerName: string) => void;
  leaveRoom: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
  isScreenSharing: boolean;
  sendModuleEvent: (moduleId: string, event: string, payload: unknown, to?: string) => void;
  onModuleEvent: (handler: (env: ModuleEventEnvelope) => void) => () => void;
}

const Ctx = createContext<WebRTCCtx>({} as WebRTCCtx);

export function WebRTCProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [room, setRoom] = useState<Room | null>(null);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("");
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const moduleHandlers = useRef<Set<(env: ModuleEventEnvelope) => void>>(new Set());
  const selfNameRef = useRef("");

  function updatePeers() {
    setPeers(new Map(peersRef.current));
  }

  function createPC(peerId: string, peerName: string): PeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dataChannels = new Map<string, RTCDataChannel>();

    const conn: PeerConnection = { peerId, peerName, pc, dataChannels };
    peersRef.current.set(peerId, conn);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    }

    // Remote stream
    pc.ontrack = (e) => {
      const existing = peersRef.current.get(peerId);
      if (existing) {
        existing.stream = e.streams[0];
        peersRef.current.set(peerId, existing);
        updatePeers();
      }
    };

    // ICE
    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit("signal:ice", { to: peerId, candidate: e.candidate.toJSON(), from: socket.id });
      }
    };

    // Data channel (receive side)
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dataChannels.set(dc.label, dc);
      dc.onmessage = (ev) => {
        try {
          const env: ModuleEventEnvelope = JSON.parse(ev.data);
          moduleHandlers.current.forEach((h) => h({ ...env, from: peerId }));
        } catch (_) {}
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(peerId);
      }
    };

    updatePeers();
    return conn;
  }

  function openDataChannel(conn: PeerConnection, label: string) {
    if (conn.dataChannels.has(label)) return conn.dataChannels.get(label)!;
    const dc = conn.pc.createDataChannel(label);
    conn.dataChannels.set(label, dc);
    dc.onmessage = (ev) => {
      try {
        const env: ModuleEventEnvelope = JSON.parse(ev.data);
        moduleHandlers.current.forEach((h) => h({ ...env, from: conn.peerId }));
      } catch (_) {}
    };
    return dc;
  }

  async function initiateOffer(peerId: string, peerName: string) {
    const conn = createPC(peerId, peerName);
    openDataChannel(conn, "nexroom");
    const offer = await conn.pc.createOffer();
    await conn.pc.setLocalDescription(offer);
    socket?.emit("signal:offer", { to: peerId, offer, from: socket.id });
  }

  function removePeer(peerId: string) {
    const conn = peersRef.current.get(peerId);
    if (conn) {
      conn.pc.close();
      peersRef.current.delete(peerId);
      updatePeers();
    }
  }

  // ── Socket events ──
  useSocketEvent(socket, "room:joined", ({ room: r, self }: { room: Room; self: { id: string; name: string } }) => {
    setRoom(r);
    setSelfId(self.id);
    setSelfName(selfNameRef.current);
    // Initiate offers to all existing peers
    r.peers.filter((p) => p.id !== self.id).forEach((p) => initiateOffer(p.id, p.name));
  });

  useSocketEvent(socket, "peer:joined", ({ peer }: { peer: { id: string; name: string; socketId: string } }) => {
    setRoom((prev) => prev ? { ...prev, peers: [...prev.peers, peer] } : prev);
    // Offer is initiated by the joining side, we just wait
  });

  useSocketEvent(socket, "peer:left", ({ peerId }: { peerId: string }) => {
    removePeer(peerId);
    setRoom((prev) => prev ? { ...prev, peers: prev.peers.filter((p) => p.id !== peerId) } : prev);
  });

  useSocketEvent(socket, "signal:offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
    const peerName = room?.peers.find((p) => p.id === from)?.name || from;
    const conn = createPC(from, peerName);
    await conn.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await conn.pc.createAnswer();
    await conn.pc.setLocalDescription(answer);
    socket?.emit("signal:answer", { to: from, answer, from: socket!.id });
  });

  useSocketEvent(socket, "signal:answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
    const conn = peersRef.current.get(from);
    if (conn) await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  useSocketEvent(socket, "signal:ice", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
    const conn = peersRef.current.get(from);
    if (conn) await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
  });

  useSocketEvent(socket, "module:event", (env: ModuleEventEnvelope) => {
    moduleHandlers.current.forEach((h) => h(env));
  });

  // ── Public API ──

  async function joinRoom(roomId: string, roomName: string, peerName: string) {
    selfNameRef.current = peerName;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (_) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => new MediaStream());
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    socket?.emit("room:join", { roomId, roomName, peerName });
  }

  function leaveRoom() {
    socket?.emit("room:leave");
    peersRef.current.forEach((c) => c.pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRoom(null);
    setSelfId("");
    setSelfName("");
    setPeers(new Map());
    setIsScreenSharing(false);
  }

  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMicEnabled((v) => !v);
  }

  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCamEnabled((v) => !v);
  }

  async function startScreenShare() {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const videoTrack = screen.getVideoTracks()[0];
    peersRef.current.forEach((conn) => {
      const sender = conn.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) sender.replaceTrack(videoTrack);
    });
    setIsScreenSharing(true);
    videoTrack.onended = () => stopScreenShare();
  }

  function stopScreenShare() {
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (camTrack) {
      peersRef.current.forEach((conn) => {
        const sender = conn.pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }
    setIsScreenSharing(false);
  }

  const sendModuleEvent = useCallback(
    (moduleId: string, event: string, payload: unknown, to?: string) => {
      const env: ModuleEventEnvelope = { moduleId, event, payload, from: selfId };
      const msg = JSON.stringify(env);
      if (to) {
        const conn = peersRef.current.get(to);
        const dc = conn?.dataChannels.get("nexroom");
        if (dc?.readyState === "open") dc.send(msg);
      } else {
        peersRef.current.forEach((conn) => {
          const dc = conn.dataChannels.get("nexroom");
          if (dc?.readyState === "open") dc.send(msg);
        });
      }
      // Also relay via socket as fallback
      socket?.emit("module:event", { moduleId, event, payload, to });
    },
    [selfId, socket]
  );

  const onModuleEvent = useCallback((handler: (env: ModuleEventEnvelope) => void) => {
    moduleHandlers.current.add(handler);
    return () => { moduleHandlers.current.delete(handler); };
  }, []);

  return (
    <Ctx.Provider value={{
      room, selfId, selfName, peers, localStream,
      joinRoom, leaveRoom, toggleMic, toggleCam,
      startScreenShare, stopScreenShare,
      micEnabled, camEnabled, isScreenSharing,
      sendModuleEvent, onModuleEvent,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWebRTC() {
  return useContext(Ctx);
}
