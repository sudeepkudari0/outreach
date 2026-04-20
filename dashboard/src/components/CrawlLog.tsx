"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";

export default function CrawlLog() {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/crawl-log";

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      setLogs((prev) => [...prev, event.data]);
    };

    ws.onopen = () => {
      setLogs((prev) => [...prev, "[System] Connected to live log stream..."]);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setLogs((prev) => [...prev, "[System] WebSocket connection error"]);
    };

    ws.onclose = () => {
      setLogs((prev) => [...prev, "[System] Log stream disconnected"]);
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogStyle = (log: string) => {
    if (log.includes("[System]")) return "text-blue-400";
    if (log.includes("Error") || log.includes("failed") || log.includes("Failed"))
      return "text-red-400";
    if (log.includes("Auth wall")) return "text-red-500 font-bold";
    if (log.includes("New job saved") || log.includes("Draft generated"))
      return "text-green-400";
    if (log.includes("Warning") || log.includes("No jobs found") || log.includes("No emails found"))
      return "text-yellow-400";
    if (log.includes("[LinkedIn]") || log.includes("[Naukri]"))
      return "text-cyan-400";
    return "text-neutral-300";
  };

  return (
    <div
      ref={containerRef}
      className="bg-black border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-full"
    >
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>Live Scraper Logs</span>
          <span className="text-neutral-600">({logs.length})</span>
        </div>
        <button
          onClick={clearLogs}
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic">
            Waiting for log activity...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`mb-1 break-all ${getLogStyle(log)}`}>
              <span className="text-neutral-600 mr-2">
                {new Date().toLocaleTimeString([], {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}