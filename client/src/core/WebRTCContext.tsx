import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import mqtt from "mqtt";
import { Peer } from "peerjs";
import type { ModuleEventEnvelope, PeerConnection, Room } from "./types";
import {
  ICE_SERVERS,
  gatherCandidates,
} from "./signalingUtils";
import { getAllModules } from "./moduleRegistry";


// ── Phase state machine ────────────────────────────────────────────────────────
// idle → gathering → offer_ready → in_room   (host path)
// idle → gathering → answer_ready → in_room  (guest path)
export type Phase =
  | "idle"
  | "gathering"
  | "offer_ready"
  | "answer_ready"
  | "in_room";

interface WebRTCCtx {
  phase: Phase;
  myCode: string;          // room code or manual code to share
  gatherError: string;     // error during ICE gathering
  signalingMethod: "mqtt" | "peerjs" | "manual" | null;

  // Generic State Synchronization Layer
  getModuleState: (moduleId: string) => any;
  setModuleState: (moduleId: string, data: any, broadcast?: boolean) => void;
  syncModuleState: (moduleId: string) => void;

  // Signaling actions
  startHost: (myName: string, roomName: string) => Promise<void>;
  startGuest: (roomCode: string, myName: string) => Promise<void>;
  completeHandshake: (answerCode: string) => Promise<void>;
  generateInvite: () => Promise<void>;

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
  const [signalingMethod, setSignalingMethod] = useState<"mqtt" | "peerjs" | "manual" | null>(null);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const moduleHandlers = useRef<Set<(env: ModuleEventEnvelope) => void>>(new Set());
  const pendingPCRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const roomRef = useRef<Room | null>(null);
  const selfNameRef = useRef("");
  const mqttClientRef = useRef<any>(null);
  const peerjsRef = useRef<any>(null);

  // Centralized key-value state store with timestamps
  const moduleStatesRef = useRef<Record<string, { data: any; timestamp: number }>>({});

  const getModuleState = useCallback((moduleId: string) => {
    return moduleStatesRef.current[moduleId]?.data;
  }, []);

  const setModuleState = useCallback((moduleId: string, data: any, broadcast = true) => {
    const timestamp = Date.now();
    moduleStatesRef.current[moduleId] = { data, timestamp };

    if (!broadcast) return;

    // Broadcast update to all connected peers
    const msg = JSON.stringify({
      moduleId: "system",
      event: "state:sync",
      payload: {
        moduleId,
        data,
        timestamp,
      },
      from: selfId,
    });

    peersRef.current.forEach((conn) => {
      const dc = conn.dataChannels.get("nexroom");
      if (dc?.readyState === "open") {
        dc.send(msg);
      }
    });
  }, [selfId]);

  const syncModuleState = useCallback((moduleId: string) => {
    const msg = JSON.stringify({
      moduleId: "system",
      event: "state:request",
      payload: { moduleId },
      from: selfId,
    });

    peersRef.current.forEach((conn) => {
      const dc = conn.dataChannels.get("nexroom");
      if (dc?.readyState === "open") {
        dc.send(msg);
      }
    });
  }, [selfId]);

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
      }
      if (s === "failed" || s === "closed") removePeer(peerId);
    };

    updatePeers();
    return conn;
  }

  function wireDataChannel(dc: RTCDataChannel, peerId: string) {
    const triggerSync = () => {
      try {
        const modules = getAllModules();
        modules.forEach((mod) => {
          const msg = JSON.stringify({
            moduleId: "system",
            event: "state:request",
            payload: { moduleId: mod.id },
            from: selfId,
          });
          if (dc.readyState === "open") {
            dc.send(msg);
          }
        });
      } catch (e) {
        console.error("Failed to auto-sync modules on channel open:", e);
      }
    };

    if (dc.readyState === "open") {
      triggerSync();
    } else {
      dc.onopen = () => {
        console.log(`Data channel to ${peerId} opened. Requesting sync...`);
        triggerSync();
      };
    }

    dc.onmessage = (ev) => {
      try {
        const env: ModuleEventEnvelope = JSON.parse(ev.data);

        // Standardized sync protocol interceptor
        if (env.moduleId === "system") {
          if (env.event === "state:request") {
            const payload = env.payload as any;
            const reqModuleId = payload.moduleId;
            const state = moduleStatesRef.current[reqModuleId];
            if (state) {
              const reply = {
                moduleId: "system",
                event: "state:sync",
                payload: {
                  moduleId: reqModuleId,
                  data: state.data,
                  timestamp: state.timestamp,
                },
                from: selfId,
              };
              dc.send(JSON.stringify(reply));
            }
          } else if (env.event === "state:sync") {
            const payload = env.payload as any;
            const syncModuleId = payload.moduleId;
            const incomingData = payload.data;
            const incomingTs = payload.timestamp;
            const local = moduleStatesRef.current[syncModuleId];

            if (!local || incomingTs > local.timestamp) {
              moduleStatesRef.current[syncModuleId] = {
                data: incomingData,
                timestamp: incomingTs,
              };
              // Forward as local module-specific sync event
              const localEnv = {
                moduleId: syncModuleId,
                event: "state:sync",
                payload: incomingData,
                from: env.from,
              };
              moduleHandlers.current.forEach((h) => h(localEnv));
            }
          }
          return; // Don't propagate system events to components directly
        }

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

  // ── Host path ───────────────────────────────────────────────────────────────

  async function startHost(myName: string, roomName: string) {
    setSelfName(myName);
    selfNameRef.current = myName;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomRef.current = { id: roomId, name: roomName, peers: [] };
    setRoom(roomRef.current);

    setPhase("gathering");
    setGatherError("");
    setMyCode(roomId);

    try {
      await acquireMedia();
      console.log("Attempting MQTT signaling...");
      const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
        connectTimeout: 4000,
        reconnectPeriod: 0,
      });
      mqttClientRef.current = client;

      const mqttTimeout = setTimeout(() => {
        if (client.connected) return;
        console.log("MQTT timeout. Falling back to PeerJS...");
        client.end();
        mqttClientRef.current = null;
        tryPeerJSHost(myName, roomName, roomId);
      }, 4000);

      client.on("connect", () => {
        clearTimeout(mqttTimeout);
        console.log("MQTT connected successfully");
        setSignalingMethod("mqtt");
        client.subscribe(`webrtc-v3/${roomId}/knock`, { qos: 1 });
        client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
        client.publish(`webrtc-v3/${roomId}/answer`, "", { qos: 1, retain: true });
        setPhase("in_room");
      });

      client.on("message", async (topic: string, payload: any) => {
        if (!topic.endsWith("/knock")) return;
        const msgStr = payload.toString();
        if (!msgStr) return;

        try {
          const msg = JSON.parse(msgStr);
          if (!msg || msg.senderId === selfId) return;

          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pendingPCRef.current.set(msg.senderId, pc);

          const tempConn: PeerConnection = { peerId: msg.senderId, peerName: msg.senderName, pc, dataChannels: new Map() };
          createDataChannel(tempConn, "nexroom");

          const { sdp, candidates } = await gatherCandidates(pc, "answer", msg.sdp);

          if (msg.candidates) {
            for (const c of msg.candidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
          }

          const answerPayload = {
            sdp,
            candidates,
            senderId: selfId,
            senderName: myName,
          };

          client.publish(`webrtc-v3/${roomId}/answer`, JSON.stringify(answerPayload), { qos: 1, retain: true });
          client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });

          const conn = wirePC(pc, msg.senderId, msg.senderName);
          createDataChannel(conn, "nexroom");
          pendingPCRef.current.delete(msg.senderId);

          roomRef.current = {
            ...roomRef.current!,
            peers: [...(roomRef.current?.peers ?? []), { id: msg.senderId, name: msg.senderName }],
          };
          setRoom({ ...roomRef.current });
        } catch (e) {
          console.error("Error parsing knock offer:", e);
        }
      });

      client.on("error", (err) => {
        console.error("MQTT error:", err);
        clearTimeout(mqttTimeout);
        if (signalingMethod === null) {
          client.end();
          mqttClientRef.current = null;
          tryPeerJSHost(myName, roomName, roomId);
        }
      });
    } catch (e) {
      console.error("MQTT setup exception:", e);
      tryPeerJSHost(myName, roomName, roomId);
    }
  }

  async function tryPeerJSHost(myName: string, roomName: string, roomId: string) {
    console.log("Attempting PeerJS signaling...");
    try {
      const peer = new Peer(`nexroom-${roomId}`);
      peerjsRef.current = peer;

      const peerTimeout = setTimeout(() => {
        if (peer.open) return;
        console.log("PeerJS timeout. Falling back to Manual...");
        peer.destroy();
        peerjsRef.current = null;
        tryManualHost(myName, roomName);
      }, 5000);

      peer.on("open", (id) => {
        clearTimeout(peerTimeout);
        console.log("PeerJS host opened ID:", id);
        setSignalingMethod("peerjs");
        setPhase("in_room");
      });

      peer.on("connection", (conn) => {
        conn.on("open", () => {
          const peerName = conn.metadata?.name || "Guest";
          const guestId = conn.peer.replace("nexroom-", "");
          
          const pc = conn.peerConnection;
          const peerConnObj = wirePC(pc, guestId, peerName);
          createDataChannel(peerConnObj, "nexroom");

          roomRef.current = {
            ...roomRef.current!,
            peers: [...(roomRef.current?.peers ?? []), { id: guestId, name: peerName }],
          };
          setRoom({ ...roomRef.current });
        });
      });

      peer.on("call", (call) => {
        if (localStreamRef.current) {
          call.answer(localStreamRef.current);
        } else {
          call.answer(new MediaStream());
        }
        call.on("stream", (remoteStream) => {
          const guestId = call.peer.replace("nexroom-", "");
          const existingPeer = peersRef.current.get(guestId);
          if (existingPeer) {
            existingPeer.stream = remoteStream;
            peersRef.current.set(guestId, existingPeer);
            updatePeers();
          }
        });
      });

      peer.on("error", (err) => {
        console.error("PeerJS error:", err);
        clearTimeout(peerTimeout);
        if (signalingMethod === null) {
          peer.destroy();
          peerjsRef.current = null;
          tryManualHost(myName, roomName);
        }
      });
    } catch (e) {
      console.error("PeerJS setup exception:", e);
      tryManualHost(myName, roomName);
    }
  }

  async function tryManualHost(myName: string, roomName: string) {
    console.log("Falling back to Manual WebRTC...");
    setSignalingMethod("manual");
    const roomId = crypto.randomUUID().slice(0, 8);
    roomRef.current = { id: roomId, name: roomName, peers: [] };
    setRoom(roomRef.current);

    setPhase("gathering");
    setGatherError("");

    try {
      const offerId = crypto.randomUUID().slice(0, 8);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pendingPCRef.current.set(offerId, pc);

      const tempConn: PeerConnection = { peerId: offerId, peerName: "", pc, dataChannels: new Map() };
      createDataChannel(tempConn, "nexroom");

      const { sdp, candidates } = await gatherCandidates(pc, "offer");
      
      const payload = {
        type: "offer" as const, sdp, candidates,
        fromId: selfId, fromName: myName,
        roomId, roomName,
      };
      
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      setMyCode(encoded);
      setPhase("offer_ready");
    } catch (e) {
      setGatherError((e as Error).message);
      setPhase("idle");
    }
  }

  async function completeHandshake(answerCode: string) {
    setGatherError("");
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(answerCode.trim()))));
      if (payload.type !== "answer") throw new Error("Expected an answer code.");

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
      setRoom({ ...roomRef.current });
      setMyCode("");
      setPhase("in_room");
    } catch (e) {
      setGatherError((e as Error).message);
    }
  }

  // ── Guest path ──────────────────────────────────────────────────────────────

  async function startGuest(roomCode: string, myName: string) {
    if (roomCode.length > 20) {
      startManualGuest(roomCode, myName);
      return;
    }

    const upperCode = roomCode.trim().toUpperCase();
    setSelfName(myName);
    selfNameRef.current = myName;
    setPhase("gathering");
    setGatherError("");

    try {
      await acquireMedia();
      console.log("Guest attempting MQTT signaling for:", upperCode);
      const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
        connectTimeout: 4000,
        reconnectPeriod: 0,
      });
      mqttClientRef.current = client;

      const mqttTimeout = setTimeout(() => {
        if (client.connected) return;
        console.log("MQTT timeout. Falling back to PeerJS...");
        client.end();
        mqttClientRef.current = null;
        tryPeerJSGuest(upperCode, myName);
      }, 4000);

      client.on("connect", async () => {
        clearTimeout(mqttTimeout);
        console.log("MQTT connected successfully");
        setSignalingMethod("mqtt");
        client.subscribe(`webrtc-v3/${upperCode}/answer`, { qos: 1 });

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pendingPCRef.current.set("host", pc);

        const tempConn: PeerConnection = { peerId: "host", peerName: "", pc, dataChannels: new Map() };
        createDataChannel(tempConn, "nexroom");

        const { sdp, candidates } = await gatherCandidates(pc, "offer");
        const offerPayload = {
          sdp,
          candidates,
          senderId: selfId,
          senderName: myName,
        };

        client.publish(`webrtc-v3/${upperCode}/knock`, JSON.stringify(offerPayload), { qos: 1, retain: true });
        setPhase("answer_ready");
      });

      client.on("message", async (topic: string, payload: any) => {
        if (!topic.endsWith("/answer")) return;
        const msgStr = payload.toString();
        if (!msgStr) return;

        try {
          const msg = JSON.parse(msgStr);
          if (!msg || msg.senderId === selfId) return;

          const pc = pendingPCRef.current.get("host");
          if (!pc) return;

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

          if (msg.candidates) {
            for (const c of msg.candidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
          }

          roomRef.current = {
            id: upperCode,
            name: `${msg.senderName}'s Room`,
            peers: [{ id: msg.senderId, name: msg.senderName }],
          };
          setRoom(roomRef.current);

          const conn = wirePC(pc, msg.senderId, msg.senderName);
          createDataChannel(conn, "nexroom");
          pendingPCRef.current.delete("host");
          setPhase("in_room");
        } catch (e) {
          console.error("Error parsing answer:", e);
        }
      });

      client.on("error", (err) => {
        console.error("MQTT guest error:", err);
        clearTimeout(mqttTimeout);
        if (signalingMethod === null) {
          client.end();
          mqttClientRef.current = null;
          tryPeerJSGuest(upperCode, myName);
        }
      });
    } catch (e) {
      console.error("MQTT guest exception:", e);
      tryPeerJSGuest(upperCode, myName);
    }
  }

  async function tryPeerJSGuest(roomCode: string, myName: string) {
    console.log("Guest attempting PeerJS signaling for room:", roomCode);
    try {
      const peer = new Peer();
      peerjsRef.current = peer;

      const peerTimeout = setTimeout(() => {
        if (peer.open) return;
        console.log("PeerJS guest timed out. Falling back to Manual WebRTC...");
        peer.destroy();
        peerjsRef.current = null;
        setGatherError("Failed to connect automatically. Please use manual code fallback.");
        setPhase("idle");
      }, 5000);

      peer.on("open", (id) => {
        clearTimeout(peerTimeout);
        console.log("PeerJS guest opened successfully ID:", id);
        setSignalingMethod("peerjs");

        const conn = peer.connect(`nexroom-${roomCode}`, {
          metadata: { name: myName }
        });

        conn.on("open", () => {
          const pc = conn.peerConnection;
          const peerConnObj = wirePC(pc, "host", "Host");
          createDataChannel(peerConnObj, "nexroom");

          if (localStreamRef.current) {
            peer.call(`nexroom-${roomCode}`, localStreamRef.current);
          }

          roomRef.current = {
            id: roomCode,
            name: "Room",
            peers: [{ id: "host", name: "Host" }]
          };
          setRoom(roomRef.current);
          setPhase("in_room");
        });

        conn.on("error", (err) => {
          console.error("PeerJS guest connection error:", err);
          peer.destroy();
          peerjsRef.current = null;
          setGatherError("Failed to connect to host. Make sure the room code is correct.");
          setPhase("idle");
        });
      });

      peer.on("error", (err) => {
        console.error("PeerJS guest error:", err);
        clearTimeout(peerTimeout);
        if (signalingMethod === null) {
          peer.destroy();
          peerjsRef.current = null;
          setGatherError("Automatic connection failed. Please use manual code.");
          setPhase("idle");
        }
      });
    } catch (e) {
      console.error("PeerJS guest exception:", e);
      setGatherError("Automatic connection failed. Please use manual code.");
      setPhase("idle");
    }
  }

  async function startManualGuest(offerCode: string, myName: string) {
    setSelfName(myName);
    selfNameRef.current = myName;
    setPhase("gathering");
    setGatherError("");
    setSignalingMethod("manual");

    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(offerCode.trim()))));
      if (payload.type !== "offer") throw new Error("Expected an invite code.");

      roomRef.current = { id: payload.roomId, name: payload.roomName, peers: [{ id: payload.fromId, name: payload.fromName }] };
      setRoom(roomRef.current);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const { sdp, candidates } = await gatherCandidates(pc, "answer", payload.sdp);

      for (const c of payload.candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      wirePC(pc, payload.fromId, payload.fromName);

      const answerPayload = {
        type: "answer" as const, sdp, candidates,
        fromId: selfId, fromName: myName,
        roomId: payload.roomId, roomName: payload.roomName,
      };

      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(answerPayload))));
      setMyCode(encoded);
      setPhase("answer_ready");
    } catch (e) {
      setGatherError((e as Error).message);
      setPhase("idle");
    }
  }

  // ── Invite more peers (while already in room) ────────────────────────────────

  async function generateInvite() {
  }

  // ── Media controls ──────────────────────────────────────────────────────────

  function leaveRoom() {
    if (mqttClientRef.current) {
      try {
        const roomId = roomRef.current?.id;
        if (roomId && signalingMethod === "mqtt") {
          mqttClientRef.current.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
          mqttClientRef.current.publish(`webrtc-v3/${roomId}/answer`, "", { qos: 1, retain: true });
        }
      } catch (_) {}
      mqttClientRef.current.end();
      mqttClientRef.current = null;
    }
    if (peerjsRef.current) {
      peerjsRef.current.destroy();
      peerjsRef.current = null;
    }
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
    setSignalingMethod(null);
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
      phase, myCode, gatherError, signalingMethod,
      getModuleState, setModuleState, syncModuleState,
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

