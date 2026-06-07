# nexroom — TODO

## ✅ Completed

- [x] **Server:** Signaling server (Node.js + Socket.io + rooms)
- [x] **Client:** Vite + React + TypeScript + TailwindCSS scaffold
- [x] **Core:** WebRTC engine + module registry + SocketContext + WebRTCContext
- [x] **Module:** Video/Audio chat + screen share (`src/modules/videochat/`)
- [x] **Module:** Text chat (`src/modules/chat/`)
- [x] **Module:** Code collaboration — Monaco editor, P2P synced (`src/modules/collab/`)
- [x] **Module:** Watch party — YouTube sync (`src/modules/watchparty/`)
- [x] **Module:** Games — Tic-Tac-Toe + Draw & Guess (`src/modules/games/`)
- [x] **Module:** Whiteboard — collaborative canvas (`src/modules/whiteboard/`)
- [x] **Shell:** Room lobby + in-room layout + sidebar navigation
- [x] **CI/CD:** GitHub Actions workflow — build + push to `10xvick.github.io`
- [x] **Repo:** Created `10xvick/nexroom` on GitHub, pushed via SSH

---

## 🔧 Needs Manual Setup

- [ ] **GitHub Secret:** Add `GH_PAGES_PAT` (classic PAT, `repo` scope) to
      https://github.com/10xvick/nexroom/settings/secrets/actions
      → This enables the Actions workflow to auto-deploy on every push to `main`

---

## 🚀 Pending / Ideas

- [ ] **Module: Poker / card games** — more games for the Games module
- [ ] **Module: Music sync** — synchronized Spotify / SoundCloud listening
- [ ] **Module: File transfer** — P2P file sharing via DataChannels
- [ ] **Mobile:** Touch events for whiteboard and Draw & Guess canvas
- [ ] **Reconnect:** Auto-reconnect logic when a peer drops and rejoins
- [ ] **Persistence:** Optional room state persistence via localStorage (e.g. chat history)
- [ ] **Auth-free rooms:** QR code share for room ID
- [ ] **TURN server support:** Optional TURN config for peers behind strict NATs
- [ ] **Module hot-reload:** Dynamic module loading without page refresh

---

## 🗂 Project Structure

```
windsurf-project/
├── server/                      # Local signaling server (Socket.io)
│   ├── index.js
│   └── package.json
├── client/                      # React + TS + Vite frontend
│   ├── src/
│   │   ├── core/
│   │   │   ├── types.ts         # All shared types + NexModule interface
│   │   │   ├── moduleRegistry.ts
│   │   │   ├── SocketContext.tsx
│   │   │   └── WebRTCContext.tsx
│   │   ├── modules/
│   │   │   ├── index.ts         # ← register/unregister modules here
│   │   │   ├── videochat/
│   │   │   ├── chat/
│   │   │   ├── collab/
│   │   │   ├── watchparty/
│   │   │   ├── games/
│   │   │   └── whiteboard/
│   │   └── shell/
│   │       ├── Lobby.tsx
│   │       └── RoomShell.tsx
│   └── package.json
├── .github/workflows/deploy.yml # Auto-deploy to GitHub Pages
├── README.md
└── TODO.md                      # ← you are here
```

---

## Adding a New Module

1. Create `client/src/modules/<name>/<Name>Module.tsx` implementing `ModuleProps`
2. In `client/src/modules/index.ts`:
   ```ts
   import MyModule from "./<name>/<Name>Module";
   registerModule({ id: "<name>", label: "Label", icon: "🔧", description: "...", component: MyModule });
   ```
3. Done — appears in the sidebar automatically on next build.
