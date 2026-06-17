# nexroom

> Peer-to-peer collaboration — no clouds, no accounts, no servers you don't own.

**Live:** https://10xvick.github.io/tools/social/nexroom/

---

## Features

| Module | Description |
|--------|-------------|
| 🎥 Video Chat | Live video/audio + screen sharing via WebRTC (permissions deferred until explicit user toggle) |
| 💬 Chat | Real-time text messaging over DataChannels |
| ⌨️ Code Collab | Monaco editor synced P2P across all peers |
| 🎬 Watch Party | Synchronized YouTube playback with reactions and embedded chat |
| 🎮 Games | State-synced Tic-Tac-Toe, Chess, and Ludo boards with seat roles |
| 📁 File Share | P2P chunked (16KB base64) file sharing tab over WebRTC |
| 🖊️ Whiteboard | Collaborative drawing canvas |

---

## Architecture

```
windsurf-project/
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

Only the client needs to be started as signaling is handled by public cloud infrastructure.

### Start the client
```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

Open the app, enter a name, create a room, and share the Room ID with peers. The app will automatically establish a WebRTC connection using public signaling brokers.

---

## Deployment

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the client on every push to `main` and pushes the output to `10xvick/10xvick.github.io` under `tools/social/nexroom/`.

**Required secret:** Add a PAT (classic, with `repo` scope) as `GH_PAGES_PAT` in this repo's Settings → Secrets.

---

## Signaling & Network Architecture

nexroom operates as a **fully serverless application**. It does not require hosting or running a custom signaling server. Instead, it utilizes a tiered signaling and peer discovery protocol to establish WebRTC connections:

1. **MQTT Protocol (Tier 1)**: Attempts connection to a secure public MQTT broker (`wss://broker.emqx.io:8084/mqtt`).
2. **PeerJS Cloud (Tier 2)**: Falls back to the public PeerJS cloud signaling framework if MQTT is blocked.
3. **Manual Handshake (Tier 3)**: Ultimate fallback using base64-encoded copy-paste connection tokens.

### Global Connectivity (Not Same-Network Only)
Because signaling coordinates via public cloud gateways (EMQX secure MQTT broker and PeerJS servers), **peers do not need to be on the same local network**. 

* **Signaling**: Connects globally across different networks, cellular data, and home Wi-Fi using secure WebSockets (`wss://`).
* **WebRTC Connection**: Direct P2P channels are created using public Google STUN servers (`stun.l.google.com:19302`) to resolve and traverse NAT/firewalls.

### Data Flow

```
Peer A ──[SDP/ICE Offer (via MQTT/PeerJS)]──▶ Public Broker ──▶ Peer B
Peer A ◀──[SDP/ICE Answer (via MQTT/PeerJS)]─ Public Broker ◀── Peer B
Peer A ◀─────────────────── Direct WebRTC P2P DataChannel ───────────────────▶ Peer B
       ◀─────────────────── Direct WebRTC Media Streams (Video/Audio) ──────▶
```

Once the initial handshake succeeds, all real-time session traffic (drawings, chat messages, playback logs, video/audio) is carried **100% peer-to-peer (P2P)** directly between the browsers, maintaining complete data privacy.
