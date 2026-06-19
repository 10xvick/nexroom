import { 
  FileText, FileImage, FileAudio, FileVideo, FileCode, Archive, File 
} from "lucide-react";

export const formatSize = (bytes?: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const getFileIcon = (mimeType?: string) => {
  const mt = mimeType?.toLowerCase() ?? "";
  if (mt.startsWith("image/")) return <FileImage className="text-blue-400" size={20} />;
  if (mt.startsWith("video/")) return <FileVideo className="text-purple-400" size={20} />;
  if (mt.startsWith("audio/")) return <FileAudio className="text-emerald-400" size={20} />;
  if (mt.includes("javascript") || mt.includes("typescript") || mt.includes("json") || mt.startsWith("text/html") || mt.startsWith("text/css")) return <FileCode className="text-yellow-400" size={20} />;
  if (mt.startsWith("text/")) return <FileText className="text-gray-300" size={20} />;
  if (mt.includes("zip") || mt.includes("tar") || mt.includes("rar") || mt.includes("gzip") || mt.includes("7z")) return <Archive className="text-orange-400" size={20} />;
  return <File className="text-muted" size={20} />;
};
