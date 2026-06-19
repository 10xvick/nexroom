import { useCallback, useMemo } from "react";
import { useWebRTC } from "./WebRTCContext";
import type { FileTransferState } from "./types";

export function useFileTransfer(
  moduleId: string,
  isActive: boolean = true
) {
  const { transfers: globalTransfers, startFileTransfer: globalStart, cancelTransfer: globalCancel, requestFileDownload } = useWebRTC();

  const transfers = useMemo(() => {
    const filtered: Record<string, FileTransferState> = {};
    for (const [id, t] of Object.entries(globalTransfers)) {
      if (t.moduleId === moduleId) {
        filtered[id] = t;
      }
    }
    return filtered;
  }, [globalTransfers, moduleId]);

  const startFileTransfer = useCallback((file: File, targetPeerId: string) => {
    return globalStart(moduleId, file, targetPeerId);
  }, [globalStart, moduleId]);

  const cancelTransfer = useCallback((fileId: string) => {
    globalCancel(moduleId, fileId);
  }, [globalCancel, moduleId]);

  const requestDownload = useCallback((fileId: string) => {
    requestFileDownload(fileId);
  }, [requestFileDownload]);

  return {
    transfers,
    startFileTransfer,
    cancelTransfer,
    requestDownload,
  };
}
