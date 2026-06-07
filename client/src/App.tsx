import { WebRTCProvider, useWebRTC } from "./core/WebRTCContext";
import { getAllModules } from "./core/moduleRegistry";
import Lobby from "./shell/Lobby";
import RoomShell from "./shell/RoomShell";
import "./modules/index"; // register all modules

function Inner() {
  const { phase } = useWebRTC();
  return phase === "in_room" ? <RoomShell /> : <Lobby />;
}

export default function App() {
  return (
    <WebRTCProvider>
      <Inner />
    </WebRTCProvider>
  );
}

export { getAllModules };
