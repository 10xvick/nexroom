import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── Room State ──────────────────────────────────────────────────────────────
const rooms = new Map();
// room: { id, name, peers: Map<socketId, { id, name, socketId }>, moduleState: {} }

function getOrCreateRoom(roomId, roomName) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, name: roomName || roomId, peers: new Map(), moduleState: {} });
  }
  return rooms.get(roomId);
}

function roomPublicInfo(room) {
  return {
    id: room.id,
    name: room.name,
    peers: Array.from(room.peers.values()),
    moduleState: room.moduleState,
  };
}

// ─── REST: room list ─────────────────────────────────────────────────────────
app.get("/rooms", (_req, res) => {
  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    peerCount: r.peers.size,
  }));
  res.json(list);
});

app.post("/rooms", (req, res) => {
  const id = uuidv4().slice(0, 8);
  const room = getOrCreateRoom(id, req.body.name || id);
  res.json({ id: room.id, name: room.name });
});

// ─── Socket Signaling ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  let currentRoomId = null;
  let peerId = null;

  // ── Join room ──
  socket.on("room:join", ({ roomId, roomName, peerName }) => {
    const room = getOrCreateRoom(roomId, roomName);
    currentRoomId = roomId;
    peerId = socket.id;

    const peer = { id: socket.id, name: peerName || "Anon", socketId: socket.id };
    room.peers.set(socket.id, peer);

    socket.join(roomId);

    // Tell the joiner about existing peers
    socket.emit("room:joined", { room: roomPublicInfo(room), self: peer });

    // Tell others a new peer joined
    socket.to(roomId).emit("peer:joined", { peer });
  });

  // ── WebRTC Signaling: offer / answer / ice-candidate ──
  socket.on("signal:offer", ({ to, offer, from }) => {
    io.to(to).emit("signal:offer", { from, offer });
  });

  socket.on("signal:answer", ({ to, answer, from }) => {
    io.to(to).emit("signal:answer", { from, answer });
  });

  socket.on("signal:ice", ({ to, candidate, from }) => {
    io.to(to).emit("signal:ice", { from, candidate });
  });

  // ── Module events (namespaced by module id) ──
  // Modules emit: module:event  { moduleId, event, payload, to? }
  // Server relays to room or specific peer
  socket.on("module:event", ({ moduleId, event, payload, to }) => {
    if (!currentRoomId) return;
    const envelope = { moduleId, event, payload, from: socket.id };
    if (to) {
      io.to(to).emit("module:event", envelope);
    } else {
      socket.to(currentRoomId).emit("module:event", envelope);
    }
  });

  // Module can persist state to room (e.g. watchparty currentTime)
  socket.on("module:setState", ({ moduleId, state }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.moduleState[moduleId] = { ...(room.moduleState[moduleId] || {}), ...state };
    socket.to(currentRoomId).emit("module:stateSync", { moduleId, state: room.moduleState[moduleId] });
  });

  socket.on("module:getState", ({ moduleId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    const state = room?.moduleState?.[moduleId] || {};
    socket.emit("module:stateSync", { moduleId, state });
  });

  // ── Leave / disconnect ──
  socket.on("room:leave", () => cleanup());
  socket.on("disconnect", () => cleanup());

  function cleanup() {
    if (!currentRoomId || !peerId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.peers.delete(peerId);
      socket.to(currentRoomId).emit("peer:left", { peerId });
      if (room.peers.size === 0) rooms.delete(currentRoomId);
    }
    socket.leave(currentRoomId);
    currentRoomId = null;
    peerId = null;
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`[signaling] http://localhost:${PORT}`));
