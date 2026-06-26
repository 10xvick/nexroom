const TURN_USERNAME = "YOUR_METERED_USERNAME";
const TURN_CREDENTIAL = "YOUR_METERED_CREDENTIAL";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80?transport=udp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turn:openrelay.metered.ca:80?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turns:openrelay.metered.ca:443?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
];

export interface SignalPayload {
  type: "offer" | "answer";
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
  fromId: string;
  fromName: string;
  roomId: string;
  roomName: string;
}

export function encodeSignal(payload: SignalPayload): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodeSignal(code: string): SignalPayload {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  } catch {
    throw new Error("Invalid code — make sure you copied the full string.");
  }
}

/** Creates an RTCPeerConnection and waits for ICE gathering to finish.
 *  Returns the fully-gathered local description + candidates. */
export async function gatherCandidates(
  pc: RTCPeerConnection,
  mode: "offer" | "answer",
  remoteSdp?: RTCSessionDescriptionInit
): Promise<{ sdp: RTCSessionDescriptionInit; candidates: RTCIceCandidateInit[] }> {
  const candidates: RTCIceCandidateInit[] = [];

  if (mode === "answer" && remoteSdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
  }

  const desc = mode === "offer" ? await pc.createOffer() : await pc.createAnswer();
  await pc.setLocalDescription(desc);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    let timer: ReturnType<typeof setTimeout>;
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        candidates.push(e.candidate.toJSON());
        clearTimeout(timer);
        timer = setTimeout(resolve, 2000); // settle 2.0 s after last candidate
      } else {
        clearTimeout(timer);
        resolve(); // null candidate = gathering complete
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(timer); resolve(); }
    };
    setTimeout(resolve, 12000); // hard 12 s timeout
  });

  return { sdp: pc.localDescription!, candidates };
}

