import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { ModuleEventEnvelope, SignalEnvelope } from "./types";

interface SocketCtx {
  socket: Socket | null;
  connected: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

const Ctx = createContext<SocketCtx>({
  socket: null,
  connected: false,
  serverUrl: "",
  setServerUrl: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const stored = localStorage.getItem("nexroom_server") || "http://localhost:4000";
  const [serverUrl, setServerUrlState] = useState(stored);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!serverUrl) return;
    if (socketRef.current) socketRef.current.disconnect();

    const s = io(serverUrl, { transports: ["websocket"] });
    socketRef.current = s;

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    return () => { s.disconnect(); };
  }, [serverUrl]);

  function setServerUrl(url: string) {
    localStorage.setItem("nexroom_server", url);
    setServerUrlState(url);
  }

  return (
    <Ctx.Provider value={{ socket: socketRef.current, connected, serverUrl, setServerUrl }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSocket() {
  return useContext(Ctx);
}

// ─── Typed socket helpers ─────────────────────────────────────────────────────

export function useSocketEvent<T = unknown>(
  socket: Socket | null,
  event: string,
  handler: (data: T) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const fn = (data: T) => handlerRef.current(data);
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [socket, event]);
}

export type { ModuleEventEnvelope, SignalEnvelope };
