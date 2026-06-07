import { registerModule } from "../core/moduleRegistry";
import ChatModule from "./chat/ChatModule";
import CollabModule from "./collab/CollabModule";
import WatchPartyModule from "./watchparty/WatchPartyModule";
import GamesModule from "./games/GamesModule";
import WhiteboardModule from "./whiteboard/WhiteboardModule";

// ─── Register all built-in modules ───────────────────────────────────────────
// To add a new module: import its component and call registerModule() here.
// To remove a module: delete its registerModule() call.

registerModule({
  id: "chat",
  label: "Chat",
  icon: "💬",
  description: "Real-time text messaging",
  component: ChatModule,
});

registerModule({
  id: "collab",
  label: "Code",
  icon: "⌨️",
  description: "Live collaborative code editor",
  component: CollabModule,
});

registerModule({
  id: "watchparty",
  label: "Watch Party",
  icon: "🎬",
  description: "Synchronized YouTube viewing",
  component: WatchPartyModule,
});

registerModule({
  id: "games",
  label: "Games",
  icon: "🎮",
  description: "Multiplayer mini-games",
  component: GamesModule,
});

registerModule({
  id: "whiteboard",
  label: "Whiteboard",
  icon: "🖊️",
  description: "Collaborative drawing canvas",
  component: WhiteboardModule,
});
