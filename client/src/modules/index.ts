import React from "react";
import { registerModule } from "../core/moduleRegistry";
import WatchPartyModule from "./watchparty/WatchPartyModule";
import GamesModule from "./games/GamesModule";
import WhiteboardModule from "./whiteboard/WhiteboardModule";
import CollabModule from "./collab/CollabModule";
import SettingsModule from "./settings/SettingsModule";
import { Code2, Tv, Gamepad2, Palette, Settings } from "lucide-react";

// ─── Register all built-in modules ───────────────────────────────────────────
// To add a new module: import its component and call registerModule() here.
// To remove a module: delete its registerModule() call.

registerModule({
  id: "watchparty",
  label: "Watch Party",
  icon: React.createElement(Tv, { size: 20 }),
  description: "Synchronized YouTube viewing",
  component: WatchPartyModule,
});

registerModule({
  id: "games",
  label: "Game Party",
  icon: React.createElement(Gamepad2, { size: 20 }),
  description: "Multiplayer mini-games",
  component: GamesModule,
});

registerModule({
  id: "whiteboard",
  label: "Draw Party",
  icon: React.createElement(Palette, { size: 20 }),
  description: "Collaborative drawing canvas",
  component: WhiteboardModule,
});

registerModule({
  id: "collab",
  label: "Code Party",
  icon: React.createElement(Code2, { size: 20 }),
  description: "Live collaborative code editor",
  component: CollabModule,
});

registerModule({
  id: "settings",
  label: "Settings",
  icon: React.createElement(Settings, { size: 20 }),
  description: "Personal and room preferences",
  component: SettingsModule,
});

