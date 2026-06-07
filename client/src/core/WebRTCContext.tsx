import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ModuleEventEnvelope, PeerConnection, Room } from "./types";
import {
  ICE_SERVERS,
  encodeSignal,
  decodeSignal,
  gatherCandidates,
  type SignalPayload,
} from "./signalingUtils";

// ── Phase state machine ────────────────────────────────────────────────────────
// idle → gathering → offer_ready → in_room   (host path)
// idle → gathering → answer_ready → in_room  (guest path)
// in_room → gathering → offer_ready          (invite more peers)
export type Phase =
  | "idle"
  | "gathering"
  | "offer_ready"
  | "answer_ready"
  | "in_room";

interface WebRTCCtx {
  phase: Phase;
  myCode: string;          // code to share with the other side
  gatherError: string;     // error during ICE gathering

  // Signaling actions
  startHost: (myName: string, roomName: string) => Promise<void>;
  startGuest: (offerCode: string, myName: string) => Promise<void>;
  completeHandshake: (answerCode: string) => Promise<void>;
  generateInvite: () => Promise<void>;  // add more peers while in_room

  // Room state
  room: Room | null;
  selfId: string;
  selfName: string;
  peers: Map<string, PeerConnection>;

  // Media
  localStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  isScreenSharing: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  leaveRoom: () => void;

  // Modules
  sendModuleEvent: (moduleId: string, event: string, payload: unknown, to?: string) => void;
  onModuleEvent: (handler: (env: ModuleEventEnvelope) => void) => () => void;
}

const Ctx = createContext<WebRTCCtx>({} as WebRTCCtx);

export function WebRTCProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [myCode, setMyCode] = useState("");
  const [gatherError, setGatherError] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [selfId] = useState(() => crypto.randomUUID().slice(0, 8));
  const [selfName, setSelfName] = useState("");
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const moduleHandlers = useRef<Set<(env: ModuleEventEnvelope) => void>>(new Set());
  // pending PC waiting for answer (keyed by the temp offer id)
  const pendingPCRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const roomRef = useRef<Room | null>(null);
  const selfNameRef = useRef("");

  function updatePeers() {
    setPeers(new Map(peersRef.current));
  }

  // ── Media ───────────────────────────────────────────────────────────────────

  async function acquireMedia() {
    if (localStreamRef.current) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = s;
      setLocalStream(s);
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = s;
        setLocalStream(s);
      } catch {
        localStreamRef.current = new MediaStream();
        setLocalStream(localStreamRef.current);
      }
    }
  }

  // ── Peer connection management ──────────────────────────────────────────────

  function wirePC(pc: RTCPeerConnection, peerId: string, peerName: string): PeerConnection {
    const dataChannels = new Map<string, RTCDataChannel>();
    const conn: PeerConnection = { peerId, peerName, pc, dataChannels };
    peersRef.current.set(peerId, conn);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
    }

    pc.ontrack = (e) => {
      const c = peersRef.current.get(peerId);
      if (c) { c.stream = e.streams[0]; peersRef.current.set(peerId, c); updatePeers(); }
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dataChannels.set(dc.label, dc);
      wireDataChannel(dc, peerId);
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        const c = peersRef.current.get(peerId);
        if (c) { peersRef.current.set(peerId, c); updatePeers(); }
        if (phase !== "in_room") enterRoom();
      }
      if (s === "failed" || s === "closed") removePeer(peerId);
    };

    updatePeers();
    return conn;
  }

  function wireDataChannel(dc: RTCDataChannel, peerId: string) {
    dc.onmessage = (ev) => {
      try {
        const env: ModuleEventEnvelope = JSON.parse(ev.data);
        moduleHandlers.current.forEach((h) => h({ ...env, from: peerId }));
      } catch (_) {}
    };
  }

  function createDataChannel(conn: PeerConnection, label: string): RTCDataChannel {
    if (conn.dataChannels.has(label)) return conn.dataChannels.get(label)!;
    const dc = conn.pc.createDataChannel(label);
    conn.dataChannels.set(label, dc);
    wireDataChannel(dc, conn.peerId);
    return dc;
  }

  function removePeer(peerId: string) {
    const c = peersRef.current.get(peerId);
    if (c) { c.pc.close(); peersRef.current.delete(peerId); updatePeers(); }
    setRoom((r) => r ? { ...r, peers: r.peers.filter((p) => p.id !== peerId) } : r);
  }

  function enterRoom() {
    setPhase("in_room");
    if (!roomRef.current) return;
    setRoom({ ...roomRef.current });
  }

  // ── Host path ───────────────────────────────────────────────────────────────

  async function startHost(myName: string, roomName: string) {
    setSelfName(myName);
    selfNameRef.current = myName;
    const roomId = crypto.randomUUID().slice(0, 8);
    roomRef.current = { id: roomId, name: roomName, peers: [] };

    await acquireMedia();
    setPhase("gathering");
    setGatherError("");

    try {
      const offerId = crypto.randomUUID().slice(0, 8);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pendingPCRef.current.set(offerId, pc);

      // open data channel (offerer side)
      const tempConn: PeerConnection = { peerId: offerId, peerName: "", pc, dataChannels: new Map() };
      createDataChannel(tempConn, "nexroom");

      const { sdp, candidates } = await gatherCandidates(pc, "offer");
      const payload: SignalPayload = {
        type: "offer", sdp, candidates,
        fromId: selfId, fromName: myName,
        roomId, roomName,
      };
      setMyCode(encodeSignal(payload));
      setPhase("offer_ready");
    } catch (e) {
      setGatherError((e as Error).message);
      setPhase("idle");
    }
  }

  async function completeHandshake(answerCode: string) {
    setGatherError("");
    try {
      const payload = decodeSignal(answerCode);
      if (payload.type !== "answer") throw new Error("Expected an answer code.");

      // find the pending PC — for simplicity take the first one
      const [offerId, pc] = [...pendingPCRef.current.entries()][0] ?? [];
      if (!pc) throw new Error("No pending connection found.");

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of payload.candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      const conn = wirePC(pc, payload.fromId, payload.fromName);
      createDataChannel(conn, "nexroom");
      pendingPCRef.current.delete(offerId);

      roomRef.current = {
        ...roomRef.current!,
        peers: [...(roomRef.current?.peers ?? []), { id: payload.fromId, name: payload.fromName }],
      };
      setMyCode("");
    } catch (e) {
      setGatherError((e as Error).message);
    }
  }

  // ── Guest path ──────────────────────────────────────────────────────────────

  async function startGuest(offerCode: string, myName: string) {
    setSelfName(myName);
    selfNameRef.current = myName;
    setPhase("gathering");
    setGatherError("");

    try {
      const payload = decodeSignal(offerCode);
      if (payload.type !== "offer") throw new Error("Expected an invite code.");

      roomRef.current = { id: payload.roomId, name: payload.roomName, peers: [{ id: payload.fromId, name: payload.fromName }] };

      await acquireMedia();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const { sdp, candidates } = await gatherCandidates(pc, "answer", payload.sdp);

      // apply the offerer's ICE candidates
      for (const c of payload.candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      wirePC(pc, payload.fromId, payload.fromName);

      const answerPayload: SignalPayload = {
        type: "answer", sdp, candidates,
        fromId: selfId, fromName: myName,
        roomId: payload.roomId, roomName: payload.roomName,
      };
      setMyCode(encodeSignal(answerPayload));
      setPhase("answer_ready");
    } catch (e) {
      setGatherError((e as Error).message);
      setPhase("idle");
    }
  }

  // ── Invite more peers (while already in room) ────────────────────────────────

  async function generateInvite() {
    if (!roomRef.current) return;
    setPhase("gathering");
    setGatherError("");
    try {
      const offerId = crypto.randomUUID().slice(0, 8);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pendingPCRef.current.set(offerId, pc);
      const tempConn: PeerConnection = { peerId: offerId, peerName: "", pc, dataChannels: new Map() };
      createDataChannel(tempConn, "nexroom");

      const { sdp, candidates } = await gatherCandidates(pc, "offer");
      const payload: SignalPayload = {
        type: "offer", sdp, candidates,
        fromId: selfId, fromName: selfNameRef.current,
        roomId: roomRef.current.id, roomName: roomRef.current.name,
      };
      setMyCode(encodeSignal(payload));
      setPhase("offer_ready");
    } catch (e) {
      setGatherError((e as Error).message);
      setPhase("in_room");
    }
  }

  // ── Media controls ──────────────────────────────────────────────────────────

  function leaveRoom() {
    peersRef.current.forEach((c) => c.pc.close());
    peersRef.current.clear();
    pendingPCRef.current.forEach((pc) => pc.close());
    pendingPCRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    roomRef.current = null;
    setLocalStream(null);
    setRoom(null);
    setSelfName("");
    setPeers(new Map());
    setMyCode("");
    setPhase("idle");
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
    videoTrack.onended = stopScreenShare;
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

  // ── Module events ────────────────────────────────────────────────────────────

  const sendModuleEvent = useCallback(
    (moduleId: string, event: string, payload: unknown, to?: string) => {
      const env: ModuleEventEnvelope = { moduleId, event, payload, from: selfId };
      const msg = JSON.stringify(env);
      if (to) {
        const dc = peersRef.current.get(to)?.dataChannels.get("nexroom");
        if (dc?.readyState === "open") dc.send(msg);
      } else {
        peersRef.current.forEach((conn) => {
          const dc = conn.dataChannels.get("nexroom");
          if (dc?.readyState === "open") dc.send(msg);
        });
      }
    },
    [selfId]
  );

  const onModuleEvent = useCallback((handler: (env: ModuleEventEnvelope) => void) => {
    moduleHandlers.current.add(handler);
    return () => { moduleHandlers.current.delete(handler); };
  }, []);

  return (
    <Ctx.Provider value={{
      phase, myCode, gatherError,
      startHost, startGuest, completeHandshake, generateInvite,
      room, selfId, selfName, peers,
      localStream, micEnabled, camEnabled, isScreenSharing,
      toggleMic, toggleCam, startScreenShare, stopScreenShare, leaveRoom,
      sendModuleEvent, onModuleEvent,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWebRTC() {
  return useContext(Ctx);
}

