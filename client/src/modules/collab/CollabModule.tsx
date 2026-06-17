import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useWebRTC } from "../../core/WebRTCContext";
import type { ModuleProps } from "../../core/types";
import { Code2, Play } from "lucide-react";

const LANGS = ["typescript", "javascript", "python", "rust", "go", "html", "css", "json"];

interface CodeOp {
  value: string;
  lang: string;
  from: string;
}

export default function CollabModule({ selfId, sendModuleEvent, onModuleEvent }: ModuleProps) {
  const { getModuleState, setModuleState, syncModuleState } = useWebRTC();
  const [code, setCodeState] = useState("// Start coding together!\n");
  const [lang, setLangState] = useState("typescript");
  const [output, setOutput] = useState<string | null>(null);
  const suppressRef = useRef(false);

  const codeRef = useRef(code);
  const langRef = useRef(lang);

  function setCode(val: string) {
    setCodeState(val);
    codeRef.current = val;
  }

  function setLang(val: string) {
    setLangState(val);
    langRef.current = val;
  }

  useEffect(() => {
    // Load initial cached state if available
    const cached = getModuleState("collab");
    if (cached) {
      suppressRef.current = true;
      setCode(cached.code);
      setLang(cached.lang);
      suppressRef.current = false;
    }

    // Request latest state from peers
    syncModuleState("collab");

    return onModuleEvent((env) => {
      if (env.moduleId !== "collab") return;
      if (env.event === "op" && env.from !== selfId) {
        const op = env.payload as CodeOp;
        suppressRef.current = true;
        setCode(op.value);
        setLang(op.lang);
        suppressRef.current = false;
      } else if (env.event === "state:sync") {
        const payload = env.payload as { code: string; lang: string };
        suppressRef.current = true;
        setCode(payload.code);
        setLang(payload.lang);
        suppressRef.current = false;
      }
    });
  }, [onModuleEvent, selfId, getModuleState, syncModuleState]);

  function handleChange(val: string | undefined) {
    const v = val ?? "";
    setCode(v);
    if (!suppressRef.current) {
      sendModuleEvent("op", { value: v, lang: langRef.current, from: selfId } as CodeOp);
      setModuleState("collab", { code: v, lang: langRef.current });
    }
  }

  function handleLangChange(l: string) {
    setLang(l);
    sendModuleEvent("op", { value: codeRef.current, lang: l, from: selfId } as CodeOp);
    setModuleState("collab", { code: codeRef.current, lang: l });
  }

  function runCode() {
    if (lang !== "javascript" && lang !== "typescript") {
      setOutput("▶ Local execution only available for JavaScript/TypeScript.");
      return;
    }
    try {
      const logs: string[] = [];
      const fakeConsole = { log: (...a: unknown[]) => logs.push(a.map(String).join(" ")) };
      // eslint-disable-next-line no-new-func
      new Function("console", code)(fakeConsole);
      setOutput(logs.join("\n") || "(no output)");
    } catch (e) {
      setOutput(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface/50">
        <Code2 size={16} className="text-accent" />
        <span className="text-sm font-medium text-white">Code Collab</span>
        <div className="flex-1" />
        <select
          value={lang}
          onChange={(e) => handleLangChange(e.target.value)}
          className="text-xs py-1 px-2"
        >
          {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button className="btn-ghost text-xs py-1 px-2 gap-1" onClick={runCode}>
          <Play size={12} /> Run
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={lang}
          value={code}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12 },
          }}
        />
      </div>

      {output !== null && (
        <div className="border-t border-border bg-black/40 p-3 max-h-32 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted font-mono">Output</span>
            <button className="text-xs text-muted hover:text-white" onClick={() => setOutput(null)}>✕</button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  );
}
