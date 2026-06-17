import React from "react";
import { registerModule } from "../core/moduleRegistry";
import ChatModule from "./chat/ChatModule";
import CollabModule from "./collab/CollabModule";
import WatchPartyModule from "./watchparty/WatchPartyModule";
import GamesModule from "./games/GamesModule";
import WhiteboardModule from "./whiteboard/WhiteboardModule";
import FileSharingModule from "./filesharing/FileSharingModule";
import { MessageSquare, Code2, Tv, Gamepad2, Palette, FolderUp } from "lucide-react";

// ─── Register all built-in modules ───────────────────────────────────────────
// To add a new module: import its component and call registerModule() here.
// To remove a module: delete its registerModule() call.

registerModule({
  id: "chat",
  label: "Chat",
  icon: React.createElement(MessageSquare, { size: 20 }),
  description: "Real-time text messaging",
  component: ChatModule,
});

registerModule({
  id: "collab",
  label: "Code",
  icon: React.createElement(Code2, { size: 20 }),
  description: "Live collaborative code editor",
  component: CollabModule,
});

registerModule({
  id: "watchparty",
  label: "Watch Party",
  icon: React.createElement(Tv, { size: 20 }),
  description: "Synchronized YouTube viewing",
  component: WatchPartyModule,
});

registerModule({
  id: "games",
  label: "Games",
  icon: React.createElement(Gamepad2, { size: 20 }),
  description: "Multiplayer mini-games",
  component: GamesModule,
});

registerModule({
  id: "whiteboard",
  label: "Whiteboard",
  icon: React.createElement(Palette, { size: 20 }),
  description: "Collaborative drawing canvas",
  component: WhiteboardModule,
});

registerModule({
  id: "filesharing",
  label: "File Share",
  icon: React.createElement(FolderUp, { size: 20 }),
  description: "Direct P2P file sharing",
  component: FileSharingModule,
});
