import { useState } from "react";
import { SocketProvider } from "./core/SocketContext";
import { WebRTCProvider } from "./core/WebRTCContext";
import { useWebRTC } from "./core/WebRTCContext";
import { getAllModules } from "./core/moduleRegistry";
import { useSocket } from "./core/SocketContext";
import Lobby from "./shell/Lobby";
import RoomShell from "./shell/RoomShell";
import "./modules/index"; // register all modules

function Inner() {
  const { room } = useWebRTC();
  return room ? <RoomShell /> : <Lobby />;
}

export default function App() {
  return (
    <SocketProvider>
      <WebRTCProvider>
        <Inner />
      </WebRTCProvider>
    </SocketProvider>
  );
}

export { getAllModules, useSocket };
