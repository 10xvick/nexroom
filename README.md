# nexroom

> Peer-to-peer collaboration — no clouds, no accounts, no servers you don't own.

**Live:** https://10xvick.github.io/tools/social/nexroom/

---

## Features

| Module | Description |
|--------|-------------|
| 🎥 Video Chat | Live video/audio + screen sharing via WebRTC |
| 💬 Chat | Real-time text messaging over DataChannels |
| ⌨️ Code Collab | Monaco editor synced P2P across all peers |
| 🎬 Watch Party | Synchronized YouTube playback |
| 🎮 Games | Tic-Tac-Toe + Draw & Guess (pluggable) |
| 🖊️ Whiteboard | Collaborative drawing canvas |

---

## Architecture

```
windsurf-project/
├── server/          # Local signaling server (Socket.io)
│   └── index.js
└── client/          # React + TS + Vite frontend
    └── src/
        ├── core/
        │   ├── types.ts            # All shared types + NexModule interface
        │   ├── moduleRegistry.ts   # Register / lookup modules
        │   ├── SocketContext.tsx    # Socket.io connection + events
        │   └── WebRTCContext.tsx    # Peer management, media, DataChannels
        ├── modules/
        │   ├── index.ts            # ← Register modules here
        │   ├── videochat/
        │   ├── chat/
        │   ├── collab/
        │   ├── watchparty/
        │   ├── games/
        │   └── whiteboard/
        └── shell/
            ├── Lobby.tsx           # Room create / join
            └── RoomShell.tsx       # In-room layout + module nav
```

### Adding a new module

1. Create `src/modules/mymodule/MyModule.tsx` implementing `ModuleProps`
2. In `src/modules/index.ts`, add:
   ```ts
   import MyModule from "./mymodule/MyModule";
   registerModule({ id: "mymodule", label: "My Module", icon: "🔧", description: "...", component: MyModule });
   ```
3. Done — it appears in the sidebar automatically.

### Removing a module

Delete its `registerModule()` call from `src/modules/index.ts`.

---

## Local Development

### 1. Start the signaling server
```bash
cd server
npm install
npm run dev
# → http://localhost:4000
```

### 2. Start the client
```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

Open the app, enter a name, create a room, share the Room ID with peers on the same network. The signaling server only handles the WebRTC handshake — all subsequent data flows peer-to-peer.

---

## Deployment

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the client on every push to `main` and pushes the output to `10xvick/10xvick.github.io` under `tools/social/nexroom/`.

**Required secret:** Add a PAT (classic, with `repo` scope) as `GH_PAGES_PAT` in this repo's Settings → Secrets.

---

## Data flow

```
Peer A ──[SDP offer]──▶ signaling server ──▶ Peer B
Peer A ◀──[SDP answer]── signaling server ◀── Peer B
Peer A ◀──────────── WebRTC DataChannel (P2P) ──────────── Peer B
       ◀──────────── WebRTC Media streams (P2P) ──────────▶
```

After the initial handshake, the signaling server carries zero traffic.
