import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import mqtt from "mqtt";
import { Peer } from "peerjs";
import type { ModuleEventEnvelope, PeerConnection, Room, FileMetadata, FileTransferState } from "./types";
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
  startHost: (myName: string, roomName: string, preferredMethod?: "auto" | "mqtt" | "peerjs" | "manual", timeoutSeconds?: number) => Promise<void>;
  startGuest: (roomCode: string, myName: string, preferredMethod?: "auto" | "mqtt" | "peerjs" | "manual", timeoutSeconds?: number) => Promise<void>;
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

  // Global File Transfers
  transfers: Record<string, FileTransferState>;
  startFileTransfer: (moduleId: string, file: File, targetPeerId: string) => string | null;
  cancelTransfer: (moduleId: string, fileId: string) => void;
  requestFileDownload: (fileId: string) => void;

  setSelfName: (name: string) => void;
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
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [signalingMethod, setSignalingMethod] = useState<"mqtt" | "peerjs" | "manual" | null>(null);
  const signalingMethodRef = useRef<"mqtt" | "peerjs" | "manual" | null>(null);

  const updateSignalingMethod = useCallback((method: "mqtt" | "peerjs" | "manual" | null) => {
    setSignalingMethod(method);
    signalingMethodRef.current = method;
  }, []);

  const hasRealMediaRef = useRef(false);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const moduleHandlers = useRef<Set<(env: ModuleEventEnvelope) => void>>(new Set());
  const pendingPCRef = useRef<Map<string, PeerConnection>>(new Map());
  const roomRef = useRef<Room | null>(null);
  const selfNameRef = useRef("");
  const mqttClientRef = useRef<any>(null);
  const peerjsRef = useRef<any>(null);
  const isHostRef = useRef(false);
  const activeHeartbeats = useRef<Map<string, { lastPong: number; isReconnecting: boolean; intervalId: number }>>(new Map());

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

  function initializeDummyStream() {
    try {
      // Dummy Video
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, 2, 2);
      }
      const videoStream = (canvas as any).captureStream ? (canvas as any).captureStream(1) : new MediaStream();
      const dummyVideo = videoStream.getVideoTracks()[0];

      // Dummy Audio
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const dst = audioCtx.createMediaStreamDestination();
      oscillator.connect(dst);
      oscillator.start();
      const dummyAudio = dst.stream.getAudioTracks()[0];
      
      if (dummyAudio) dummyAudio.enabled = false;
      if (dummyVideo) dummyVideo.enabled = false;

      const stream = new MediaStream();
      if (dummyVideo) stream.addTrack(dummyVideo);
      if (dummyAudio) stream.addTrack(dummyAudio);

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(false);
      setCamEnabled(false);
      hasRealMediaRef.current = false;
    } catch (e) {
      console.error("Failed to initialize dummy stream:", e);
      localStreamRef.current = new MediaStream();
      setLocalStream(localStreamRef.current);
    }
  }

  async function acquireRealMedia(enableMic: boolean, enableCam: boolean) {
    try {
      const realStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      hasRealMediaRef.current = true;

      const realVideo = realStream.getVideoTracks()[0];
      const realAudio = realStream.getAudioTracks()[0];

      if (realAudio) realAudio.enabled = enableMic;
      if (realVideo) realVideo.enabled = enableCam;

      setMicEnabled(enableMic);
      setCamEnabled(enableCam);

      const stream = new MediaStream();
      if (realVideo) stream.addTrack(realVideo);
      if (realAudio) stream.addTrack(realAudio);

      // Stop old dummy tracks
      localStreamRef.current?.getTracks().forEach((t) => t.stop());

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Update senders on all active connections
      peersRef.current.forEach((conn) => {
        conn.pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "video" && realVideo) {
            sender.replaceTrack(realVideo);
          }
          if (sender.track?.kind === "audio" && realAudio) {
            sender.replaceTrack(realAudio);
          }
        });
      });
    } catch (err) {
      console.error("Failed to acquire real media:", err);
    }
  }

  // ── Peer connection management ──────────────────────────────────────────────

  async function reconnectMQTTGuest(upperCode: string) {
    console.log("Guest attempting background MQTT reconnection...");
    try {
      pendingPCRef.current.delete("host");

      let client = mqttClientRef.current;
      if (!client || !client.connected) {
        if (client) client.end();
        client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
          connectTimeout: 4000,
          reconnectPeriod: 0,
        });
        mqttClientRef.current = client;
      }

      client.subscribe(`webrtc-v3/${upperCode}/answer`, { qos: 1 });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const tempConn: PeerConnection = { peerId: "host", peerName: "", pc, dataChannels: new Map() };
      pendingPCRef.current.set("host", tempConn);
      createDataChannel(tempConn, "nexroom");

      const { sdp, candidates } = await gatherCandidates(pc, "offer");
      const offerPayload = {
        sdp,
        candidates,
        senderId: selfId,
        senderName: selfNameRef.current,
      };

      client.publish(`webrtc-v3/${upperCode}/knock`, JSON.stringify(offerPayload), { qos: 1, retain: true });
    } catch (e) {
      console.error("Error in MQTT background reconnect:", e);
    }
  }

  async function reconnectPeerJSGuest(upperCode: string) {
    console.log("Guest attempting background PeerJS reconnection...");
    try {
      let peer = peerjsRef.current;
      if (!peer || peer.destroyed) {
        peer = new Peer();
        peerjsRef.current = peer;
      }

      const doConnect = () => {
        const conn = peer.connect(`nexroom-${upperCode}`, {
          metadata: { name: selfNameRef.current }
        });

        conn.on("open", () => {
          const pc = conn.peerConnection;
          const peerConnObj = wirePC(pc, "host", "Host");
          createDataChannel(peerConnObj, "nexroom");

          if (localStreamRef.current) {
            peer.call(`nexroom-${upperCode}`, localStreamRef.current);
          }
        });
      };

      if (peer.open) {
        doConnect();
      } else {
        peer.on("open", () => {
          doConnect();
        });
      }
    } catch (e) {
      console.error("Error in PeerJS background reconnect:", e);
    }
  }

  function triggerPeerReconnection(peerId: string) {
    if (isHostRef.current) {
      console.log(`Host waiting for guest (${peerId}) to reconnect...`);
      return;
    }

    const upperCode = roomRef.current?.id;
    if (!upperCode) return;

    const method = signalingMethodRef.current;
    if (method === "mqtt") {
      reconnectMQTTGuest(upperCode);
    } else if (method === "peerjs") {
      reconnectPeerJSGuest(upperCode);
    }
  }

  function wirePC(
    pc: RTCPeerConnection,
    peerId: string,
    peerName: string,
    existingDataChannels?: Map<string, RTCDataChannel>
  ): PeerConnection {
    const existing = peersRef.current.get(peerId);
    if (existing && existing.pc !== pc) {
      console.log(`Closing existing peer connection for ${peerId} to prevent orphaned socket.`);
      try {
        existing.pc.close();
      } catch (err) {
        console.error(`Error closing old pc for ${peerId}:`, err);
      }
    }

    const dataChannels = existingDataChannels ?? new Map<string, RTCDataChannel>();
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
        if (c) { 
          c.reconnecting = false;
          peersRef.current.set(peerId, c); 
          updatePeers(); 
        }
      }
      if (s === "failed") {
        console.warn(`Connection failed for peer ${peerId}. Triggering reconnection...`);
        const c = peersRef.current.get(peerId);
        if (c) {
          c.reconnecting = true;
          updatePeers();
        }
        triggerPeerReconnection(peerId);
      }
      if (s === "closed") {
        removePeer(peerId);
      }
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

    if (dc.label === "nexroom") {
      const existing = activeHeartbeats.current.get(peerId);
      if (existing) {
        clearInterval(existing.intervalId);
      }

      const intervalId = window.setInterval(() => {
        const hb = activeHeartbeats.current.get(peerId);
        if (!hb) return;

        const timeSinceLastPong = Date.now() - hb.lastPong;
        if (timeSinceLastPong > 10000) {
          if (!hb.isReconnecting) {
            console.warn(`Data channel heartbeat timeout for peer ${peerId}. Triggering reconnection...`);
            hb.isReconnecting = true;
            
            const p = peersRef.current.get(peerId);
            if (p) {
              p.reconnecting = true;
              updatePeers();
            }
            
            triggerPeerReconnection(peerId);
          }
        } else {
          if (dc.readyState === "open") {
            try {
              dc.send(JSON.stringify({ moduleId: "system", event: "ping", from: selfId }));
            } catch (_) {}
          }
        }
      }, 3000);

      activeHeartbeats.current.set(peerId, {
        lastPong: Date.now(),
        isReconnecting: false,
        intervalId,
      });
    }

    dc.onmessage = (ev) => {
      try {
        const env: ModuleEventEnvelope = JSON.parse(ev.data);

        // Standardized sync protocol interceptor
        if (env.moduleId === "system") {
          if (env.event === "ping") {
            const reply = {
              moduleId: "system",
              event: "pong",
              from: selfId,
            };
            if (dc.readyState === "open") {
              try {
                dc.send(JSON.stringify(reply));
              } catch (_) {}
            }
            return;
          }

          if (env.event === "pong") {
            const hb = activeHeartbeats.current.get(peerId);
            if (hb) {
              hb.lastPong = Date.now();
              if (hb.isReconnecting) {
                hb.isReconnecting = false;
                const p = peersRef.current.get(peerId);
                if (p) {
                  p.reconnecting = false;
                  updatePeers();
                }
              }
            }
            return;
          }

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
    const hb = activeHeartbeats.current.get(peerId);
    if (hb) {
      clearInterval(hb.intervalId);
      activeHeartbeats.current.delete(peerId);
    }
    const c = peersRef.current.get(peerId);
    if (c) { c.pc.close(); peersRef.current.delete(peerId); updatePeers(); }
    setRoom((r) => r ? { ...r, peers: r.peers.filter((p) => p.id !== peerId) } : r);
  }

  // ── Host path ───────────────────────────────────────────────────────────────

  async function startHost(myName: string, roomName: string, preferredMethod: "auto" | "mqtt" | "peerjs" | "manual" = "auto", timeoutSeconds = 30) {
    isHostRef.current = true;
    setSelfName(myName);
    selfNameRef.current = myName;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomRef.current = { id: roomId, name: roomName, peers: [] };
    setRoom(roomRef.current);

    setPhase("gathering");
    setGatherError("");
    setMyCode(roomId);

    if (preferredMethod === "manual") {
      tryManualHost(myName, roomName);
      return;
    }

    if (preferredMethod === "peerjs") {
      tryPeerJSHost(myName, roomName, roomId, timeoutSeconds);
      return;
    }

    if (preferredMethod === "mqtt") {
      tryMQTTHost(myName, roomName, roomId, timeoutSeconds);
      return;
    }

    try {
      initializeDummyStream();
      console.log("Racing MQTT and PeerJS signaling...");

      let resolved = false;

      // 1. Start MQTT
      const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
        connectTimeout: timeoutSeconds * 1000,
        reconnectPeriod: 0,
      });
      mqttClientRef.current = client;

      // 2. Start PeerJS
      const peer = new Peer(`nexroom-${roomId}`);
      peerjsRef.current = peer;

      const raceTimeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        console.log("Both MQTT and PeerJS timed out. Falling back to Manual...");
        if (client) {
          client.end();
          if (mqttClientRef.current === client) mqttClientRef.current = null;
        }
        if (peer) {
          peer.destroy();
          if (peerjsRef.current === peer) peerjsRef.current = null;
        }
        tryManualHost(myName, roomName);
      }, timeoutSeconds * 1000);

      // MQTT handlers
      client.on("connect", () => {
        if (resolved) {
          client.end();
          if (mqttClientRef.current === client) mqttClientRef.current = null;
          return;
        }
        resolved = true;
        clearTimeout(raceTimeout);
        if (peer) {
          peer.destroy();
          if (peerjsRef.current === peer) peerjsRef.current = null;
        }

        console.log("MQTT won the signaling race!");
        updateSignalingMethod("mqtt");
        client.subscribe(`webrtc-v3/${roomId}/knock`, { qos: 1 });
        client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
        client.publish(`webrtc-v3/${roomId}/answer`, "", { qos: 1, retain: true });
        setMyCode(roomId + "M");
        setPhase("in_room");
      });

      client.on("message", async (topic: string, payload: any) => {
        if (!topic.endsWith("/knock")) return;
        const msgStr = payload.toString();
        if (!msgStr) return;

        try {
          const msg = JSON.parse(msgStr);
          if (!msg || msg.senderId === selfId) return;

          const isDuplicate = myName.toLowerCase() === msg.senderName.toLowerCase() || 
            Array.from(peersRef.current.values()).some((p) => p.peerName.toLowerCase() === msg.senderName.toLowerCase());

          if (isDuplicate) {
            console.log(`Rejecting knock from ${msg.senderName} due to duplicate username.`);
            const rejectPayload = {
              error: "DUPLICATE_NAME",
              senderId: selfId,
            };
            client.publish(`webrtc-v3/${roomId}/answer`, JSON.stringify(rejectPayload), { qos: 1, retain: true });
            client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
            return;
          }

          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          const tempConn: PeerConnection = { peerId: msg.senderId, peerName: msg.senderName, pc, dataChannels: new Map() };
          pendingPCRef.current.set(msg.senderId, tempConn);
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

          const conn = wirePC(pc, msg.senderId, msg.senderName, tempConn.dataChannels);
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
        if (signalingMethodRef.current === null) {
          client.end();
          if (mqttClientRef.current === client) mqttClientRef.current = null;
        }
      });

      // PeerJS handlers
      peer.on("open", (id) => {
        if (resolved) {
          peer.destroy();
          if (peerjsRef.current === peer) peerjsRef.current = null;
          return;
        }
        resolved = true;
        clearTimeout(raceTimeout);
        if (client) {
          client.end();
          if (mqttClientRef.current === client) mqttClientRef.current = null;
        }

        console.log("PeerJS won the signaling race!");
        updateSignalingMethod("peerjs");
        setMyCode(roomId + "P");
        setPhase("in_room");
      });

      peer.on("connection", (conn) => {
        conn.on("open", () => {
          const peerName = conn.metadata?.name || "Guest";
          const isDuplicate = myName.toLowerCase() === peerName.toLowerCase() || 
            Array.from(peersRef.current.values()).some((p) => p.peerName.toLowerCase() === peerName.toLowerCase());

          if (isDuplicate) {
            console.log(`Rejecting PeerJS connection from ${peerName} due to duplicate username.`);
            conn.send(JSON.stringify({ moduleId: "system", event: "name_rejected", payload: { reason: "DUPLICATE_NAME" } }));
            setTimeout(() => {
              conn.close();
            }, 500);
            return;
          }

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
        if (signalingMethodRef.current === null) {
          peer.destroy();
          if (peerjsRef.current === peer) peerjsRef.current = null;
        }
      });
    } catch (e) {
      console.error("Signaling race setup exception:", e);
      tryManualHost(myName, roomName);
    }
  }

  async function tryMQTTHost(myName: string, roomName: string, roomId: string, timeoutSeconds = 30) {
    console.log("Attempting MQTT signaling...");
    try {
      initializeDummyStream();
      const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
        connectTimeout: timeoutSeconds * 1000,
        reconnectPeriod: 0,
      });
      mqttClientRef.current = client;

      const mqttTimeout = setTimeout(() => {
        if (client.connected) return;
        console.log("MQTT timeout. Falling back to Manual...");
        client.end();
        mqttClientRef.current = null;
        tryManualHost(myName, roomName);
      }, timeoutSeconds * 1000);

      client.on("connect", () => {
        clearTimeout(mqttTimeout);
        console.log("MQTT host connected successfully");
        updateSignalingMethod("mqtt");
        client.subscribe(`webrtc-v3/${roomId}/knock`, { qos: 1 });
        client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
        client.publish(`webrtc-v3/${roomId}/answer`, "", { qos: 1, retain: true });
        setMyCode(roomId + "M");
        setPhase("in_room");
      });

      client.on("message", async (topic: string, payload: any) => {
        if (!topic.endsWith("/knock")) return;
        const msgStr = payload.toString();
        if (!msgStr) return;

        try {
          const msg = JSON.parse(msgStr);
          if (!msg || msg.senderId === selfId) return;

          const isDuplicate = myName.toLowerCase() === msg.senderName.toLowerCase() || 
            Array.from(peersRef.current.values()).some((p) => p.peerName.toLowerCase() === msg.senderName.toLowerCase());

          if (isDuplicate) {
            console.log(`Rejecting knock from ${msg.senderName} due to duplicate username.`);
            const rejectPayload = {
              error: "DUPLICATE_NAME",
              senderId: selfId,
            };
            client.publish(`webrtc-v3/${roomId}/answer`, JSON.stringify(rejectPayload), { qos: 1, retain: true });
            client.publish(`webrtc-v3/${roomId}/knock`, "", { qos: 1, retain: true });
            return;
          }

          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          const tempConn: PeerConnection = { peerId: msg.senderId, peerName: msg.senderName, pc, dataChannels: new Map() };
          pendingPCRef.current.set(msg.senderId, tempConn);
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

          const conn = wirePC(pc, msg.senderId, msg.senderName, tempConn.dataChannels);
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
        if (signalingMethodRef.current === null) {
          client.end();
          mqttClientRef.current = null;
          tryManualHost(myName, roomName);
        }
      });
    } catch (e) {
      console.error("MQTT setup exception:", e);
      tryManualHost(myName, roomName);
    }
  }

  async function tryPeerJSHost(myName: string, roomName: string, roomId: string, timeoutSeconds = 30) {
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
      }, timeoutSeconds * 1000);

      peer.on("open", (id) => {
        clearTimeout(peerTimeout);
        console.log("PeerJS host opened ID:", id);
        updateSignalingMethod("peerjs");
        setMyCode(roomId + "P");
        setPhase("in_room");
      });

      peer.on("connection", (conn) => {
        conn.on("open", () => {
          const peerName = conn.metadata?.name || "Guest";
          const isDuplicate = myName.toLowerCase() === peerName.toLowerCase() || 
            Array.from(peersRef.current.values()).some((p) => p.peerName.toLowerCase() === peerName.toLowerCase());

          if (isDuplicate) {
            console.log(`Rejecting PeerJS connection from ${peerName} due to duplicate username.`);
            conn.send(JSON.stringify({ moduleId: "system", event: "name_rejected", payload: { reason: "DUPLICATE_NAME" } }));
            setTimeout(() => {
              conn.close();
            }, 500);
            return;
          }

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
        if (signalingMethodRef.current === null) {
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
    updateSignalingMethod("manual");
    const roomId = crypto.randomUUID().slice(0, 8);
    roomRef.current = { id: roomId, name: roomName, peers: [] };
    setRoom(roomRef.current);

    setPhase("gathering");
    setGatherError("");

    try {
      const offerId = crypto.randomUUID().slice(0, 8);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const tempConn: PeerConnection = { peerId: offerId, peerName: "", pc, dataChannels: new Map() };
      pendingPCRef.current.set(offerId, tempConn);
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

      const isDuplicate = selfName.toLowerCase() === payload.fromName.toLowerCase() || 
        Array.from(peersRef.current.values()).some((p) => p.peerName.toLowerCase() === payload.fromName.toLowerCase());
      if (isDuplicate) {
        throw new Error("Username is already taken in this room. Please ask them to use a different name.");
      }

      const [offerId, pendingConn] = [...pendingPCRef.current.entries()][0] ?? [];
      if (!pendingConn) throw new Error("No pending connection found.");
      const pc = pendingConn.pc;

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of payload.candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      const conn = wirePC(pc, payload.fromId, payload.fromName, pendingConn.dataChannels);
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

  async function startGuest(roomCode: string, myName: string, preferredMethod: "auto" | "mqtt" | "peerjs" | "manual" = "auto", timeoutSeconds = 30) {
    isHostRef.current = false;
    let cleanCode = roomCode.trim();
    let method = preferredMethod;

    if (cleanCode.length > 20 && !cleanCode.includes("-")) {
      startManualGuest(cleanCode, myName);
      return;
    }

    if (cleanCode.includes("-")) {
      const parts = cleanCode.split("-");
      cleanCode = parts[0];
      const suffix = parts[1].toLowerCase();
      if (suffix === "mqtt" || suffix === "m") {
        method = "mqtt";
      } else if (suffix === "peerjs" || suffix === "p") {
        method = "peerjs";
      }
    } else if (cleanCode.length === 7) {
      const suffix = cleanCode.charAt(6).toLowerCase();
      if (suffix === "m") {
        method = "mqtt";
        cleanCode = cleanCode.substring(0, 6);
      } else if (suffix === "p") {
        method = "peerjs";
        cleanCode = cleanCode.substring(0, 6);
      }
    }

    const upperCode = cleanCode.toUpperCase();
    setSelfName(myName);
    selfNameRef.current = myName;
    setPhase("gathering");
    setGatherError("");

    if (method === "peerjs") {
      tryPeerJSGuest(upperCode, myName, timeoutSeconds);
      return;
    }

    if (method === "manual") {
      startManualGuest(upperCode, myName);
      return;
    }

    try {
      initializeDummyStream();
      console.log("Guest attempting MQTT signaling for:", upperCode);
      const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
        connectTimeout: timeoutSeconds * 1000,
        reconnectPeriod: 0,
      });
      mqttClientRef.current = client;

      const mqttTimeout = setTimeout(() => {
        if (client.connected) return;
        client.end();
        mqttClientRef.current = null;
        if (method === "auto") {
          console.log("MQTT timeout. Falling back to PeerJS...");
          tryPeerJSGuest(upperCode, myName, timeoutSeconds);
        } else {
          console.log("MQTT timeout. Falling back to Manual...");
          setGatherError("Failed to connect via MQTT. Please use manual connection or try another method.");
          setPhase("idle");
        }
      }, timeoutSeconds * 1000);

      client.on("connect", async () => {
        clearTimeout(mqttTimeout);
        console.log("MQTT connected successfully");
        updateSignalingMethod("mqtt");
        client.subscribe(`webrtc-v3/${upperCode}/answer`, { qos: 1 });

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const tempConn: PeerConnection = { peerId: "host", peerName: "", pc, dataChannels: new Map() };
        pendingPCRef.current.set("host", tempConn);
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

          if (msg.error === "DUPLICATE_NAME") {
            setGatherError("Username is already taken in this room. Please choose another name.");
            setPhase("idle");
            client.end();
            if (mqttClientRef.current === client) mqttClientRef.current = null;
            return;
          }

          const pendingConn = pendingPCRef.current.get("host");
          if (!pendingConn) return;
          const pc = pendingConn.pc;

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

          const conn = wirePC(pc, msg.senderId, msg.senderName, pendingConn.dataChannels);
          createDataChannel(conn, "nexroom");
          pendingPCRef.current.delete("host");
          setMyCode(upperCode + "M");
          setPhase("in_room");
        } catch (e) {
          console.error("Error parsing answer:", e);
        }
      });

      client.on("error", (err) => {
        console.error("MQTT guest error:", err);
        clearTimeout(mqttTimeout);
        if (signalingMethodRef.current === null) {
          client.end();
          mqttClientRef.current = null;
          if (method === "auto") {
            tryPeerJSGuest(upperCode, myName);
          } else {
            setGatherError("Failed to connect via MQTT. Please use manual connection or try another method.");
            setPhase("idle");
          }
        }
      });
    } catch (e) {
      console.error("MQTT guest exception:", e);
      if (method === "auto") {
        tryPeerJSGuest(upperCode, myName);
      } else {
        setGatherError("Failed to connect via MQTT. Please use manual connection or try another method.");
        setPhase("idle");
      }
    }
  }

  async function tryPeerJSGuest(roomCode: string, myName: string, timeoutSeconds = 30) {
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
      }, timeoutSeconds * 1000);

      peer.on("open", (id) => {
        clearTimeout(peerTimeout);
        console.log("PeerJS guest opened successfully ID:", id);
        updateSignalingMethod("peerjs");

        const conn = peer.connect(`nexroom-${roomCode}`, {
          metadata: { name: myName }
        });

        conn.on("data", (dataStr: any) => {
          try {
            const msg = typeof dataStr === "string" ? JSON.parse(dataStr) : dataStr;
            if (msg.moduleId === "system" && msg.event === "name_rejected") {
              setGatherError("Username is already taken in this room. Please choose another name.");
              setPhase("idle");
              peer.destroy();
              if (peerjsRef.current === peer) peerjsRef.current = null;
            }
          } catch (e) {
            console.error("Error parsing peerjs data:", e);
          }
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
          setMyCode(roomCode + "P");
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
        if (signalingMethodRef.current === null) {
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
    updateSignalingMethod("manual");

    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(offerCode.trim()))));
      if (payload.type !== "offer") throw new Error("Expected an invite code.");

      if (myName.toLowerCase() === payload.fromName.toLowerCase()) {
        throw new Error("Username is already taken in this room. Please choose another name.");
      }

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
        if (roomId && signalingMethodRef.current === "mqtt") {
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
    activeHeartbeats.current.forEach((hb) => clearInterval(hb.intervalId));
    activeHeartbeats.current.clear();
    peersRef.current.forEach((c) => c.pc.close());
    peersRef.current.clear();
    pendingPCRef.current.forEach((conn) => conn.pc.close());
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
    updateSignalingMethod(null);
    setIsScreenSharing(false);
  }

  async function toggleMic() {
    if (!hasRealMediaRef.current) {
      await acquireRealMedia(true, camEnabled);
      return;
    }
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicEnabled(track.enabled);
    }
  }

  async function toggleCam() {
    if (!hasRealMediaRef.current) {
      await acquireRealMedia(micEnabled, true);
      return;
    }
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamEnabled(track.enabled);
    }
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

  // ── Global File Transfer Logic ───────────────────────────────────────────────
  const [transfers, setTransfers] = useState<Record<string, FileTransferState>>({});
  const sendingFilesRef = useRef<Record<string, { file: File; totalChunks: number }>>({});
  const receivingChunksRef = useRef<Record<string, { chunks: (string | undefined)[]; meta: FileMetadata; fromPeer: string; moduleId: string }>>({});

  const updateTransfer = useCallback((fileId: string, update: Partial<FileTransferState>) => {
    setTransfers((prev) => {
      const existing = prev[fileId] || {};
      return {
        ...prev,
        [fileId]: { ...existing, ...update } as FileTransferState,
      };
    });
  }, []);

  const sendChunk = useCallback((moduleId: string, fileId: string, chunkIdx: number, toPeerId: string) => {
    const task = sendingFilesRef.current[fileId];
    if (!task) return;

    const start = chunkIdx * 16384;
    const end = Math.min(start + 16384, task.file.size);
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

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

      const progress = chunkIdx + 1 === task.totalChunks 
        ? 100 
        : Math.min(Math.floor(((chunkIdx + 1) / task.totalChunks) * 100), 99);

      if (chunkIdx + 1 >= task.totalChunks) {
        updateTransfer(fileId, { status: "completed", progress: 100 });
        delete sendingFilesRef.current[fileId];
      } else {
        updateTransfer(fileId, { progress });
      }
    };

    reader.readAsDataURL(task.file.slice(start, end));
  }, [sendModuleEvent, updateTransfer]);

  // Hook up the global file transfer listener
  useEffect(() => {
    if (phase !== "in_room") return;

    const cleanup = onModuleEvent((env) => {
      const { moduleId, event, payload } = env;
      const data = payload as any;

      if (event === "file:start") {
        const meta = data as FileMetadata;
        receivingChunksRef.current[meta.fileId] = {
          chunks: new Array(meta.totalChunks).fill(undefined),
          meta,
          fromPeer: env.from,
          moduleId,
        };

        const autoDownload = localStorage.getItem("nexroom_autodownload") !== "false";

        const newTransfer: FileTransferState = {
          fileId: meta.fileId,
          moduleId,
          name: meta.name,
          size: meta.size,
          type: meta.type,
          progress: 0,
          status: autoDownload ? "receiving" : "idle",
          direction: "receive",
          peerId: env.from,
        };

        setTransfers((prev) => ({
          ...prev,
          [meta.fileId]: newTransfer,
        }));

        if (autoDownload) {
          sendModuleEvent(moduleId, "file:ack", { fileId: meta.fileId, chunkIndex: -1 }, env.from);
        }
      }

      else if (event === "file:chunk") {
        const { fileId, chunkIndex, data: chunkData } = data;
        const entry = receivingChunksRef.current[fileId];
        if (!entry) return;

        entry.chunks[chunkIndex] = chunkData;
        const received = entry.chunks.filter((c) => c !== undefined).length;
        const total = entry.meta.totalChunks;
        
        const progress = received === total 
          ? 100 
          : Math.min(Math.floor((received / total) * 100), 99);

        const status = progress === 100 ? "completed" : "receiving";
        updateTransfer(fileId, { progress, status });

        if (progress === 100) {
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
          } catch (e) {
            console.error("Failed to reassemble file:", e);
            updateTransfer(fileId, { status: "failed" });
          }
        } else {
          sendModuleEvent(moduleId, "file:ack", { fileId, chunkIndex }, env.from);
        }
      }

      else if (event === "file:ack") {
        const { fileId, chunkIndex } = data;
        const task = sendingFilesRef.current[fileId];
        if (!task) return;

        const nextChunk = chunkIndex + 1;
        if (nextChunk < task.totalChunks) {
          sendChunk(moduleId, fileId, nextChunk, env.from);
        } else {
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

    return cleanup;
  }, [phase, onModuleEvent, sendModuleEvent, sendChunk, updateTransfer]);

  const startFileTransfer = useCallback((moduleId: string, file: File, targetPeerId: string) => {
    const activePeers = Array.from(peersRef.current.values());
    if (activePeers.length === 0) return null;

    const targets = targetPeerId === "all"
      ? activePeers
      : activePeers.filter((p) => p.peerId === targetPeerId);

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const totalChunks = Math.ceil(file.size / 16384);
    const localUrl = URL.createObjectURL(file);

    sendingFilesRef.current[fileId] = { file, totalChunks };

    setTransfers((prev) => {
      const next = { ...prev };
      targets.forEach((peer) => {
        next[fileId] = {
          fileId,
          moduleId,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: "sending",
          direction: "send",
          peerId: peer.peerId,
          downloadUrl: localUrl,
        };
      });
      return next;
    });

    targets.forEach((peer) => {
      const meta: FileMetadata = { fileId, name: file.name, size: file.size, type: file.type, totalChunks };
      sendModuleEvent(moduleId, "file:start", meta, peer.peerId);
    });

    return fileId;
  }, [sendModuleEvent]);

  const cancelTransfer = useCallback((moduleId: string, fileId: string) => {
    const t = transfers[fileId];
    if (!t) return;
    sendModuleEvent(moduleId, "file:cancel", { fileId }, t.peerId);
    delete sendingFilesRef.current[fileId];
    delete receivingChunksRef.current[fileId];
    updateTransfer(fileId, { status: "failed" });
  }, [transfers, sendModuleEvent, updateTransfer]);

  const requestFileDownload = useCallback((fileId: string) => {
    const entry = receivingChunksRef.current[fileId];
    if (!entry) return;

    // Transition state from idle to receiving
    updateTransfer(fileId, { status: "receiving", progress: 0 });

    // Send the first file ack to start the transfer
    sendModuleEvent(entry.moduleId || "chat", "file:ack", { fileId, chunkIndex: -1 }, entry.fromPeer);
  }, [sendModuleEvent, updateTransfer]);

  const updateSelfName = useCallback((name: string) => {
    setSelfName(name);
    selfNameRef.current = name;
    localStorage.setItem("nexroom_selfname", name);
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
      transfers, startFileTransfer, cancelTransfer, requestFileDownload,
      setSelfName: updateSelfName,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWebRTC() {
  return useContext(Ctx);
}

