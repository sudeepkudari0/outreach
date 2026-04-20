"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

export default function CrawlLog() {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only connect in browser
    if (typeof window === "undefined") return;

    // Use WS or WSS based on current protocol, fallback to localhost:8000 for local dev
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/crawl-log";

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      setLogs((prev) => {
        // Keep last 100 messages
        const newLogs = [...prev, event.data];
        if (newLogs.length > 100) return newLogs.slice(newLogs.length - 100);
        return newLogs;
      });
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

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-full shadow-inner">
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center gap-2 text-xs font-mono text-neutral-400">
        <Terminal className="w-3.5 h-3.5" />
        <span>Live Scraper Logs</span>
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
          logs.map((log, i) => {
            // Apply simple coloring based on log content
            let colorClass = "text-neutral-300";
            if (log.includes("[System]")) colorClass = "text-blue-400";
            if (log.includes("Error") || log.includes("failed"))
              colorClass = "text-red-400";
            if (log.toLowerCase().includes("auth wall"))
              colorClass = "text-red-500 font-bold bg-red-950/50 block py-1";
            if (
              log.includes("New job saved") ||
              log.includes("Draft generated")
            )
              colorClass = "text-green-400";

            return (
              <div key={i} className={`mb-1 break-all ${colorClass}`}>
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
            );
          })
        )}
      </div>
    </div>
  );
}
