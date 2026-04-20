"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import CrawlLog from "@/components/CrawlLog";
import {
  Play,
  Loader2,
  UploadCloud,
  Linkedin,
  Briefcase,
  FileType,
} from "lucide-react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [scrapeTarget, setScrapeTarget] = useState<
    "all" | "linkedin" | "naukri"
  >("all");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");

  const scrapeMutation = useMutation({
    mutationFn: () => api.jobs.scrape(scrapeTarget),
    onSuccess: () => {
      // Refresh jobs list soon after triggering
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }, 5000);
    },
  });

  const handleResumeUpload = async () => {
    if (!resumeFile) return;

    setUploadStatus("uploading");
    try {
      await api.settings.uploadResume(resumeFile);
      setUploadStatus("success");
      setTimeout(() => setUploadStatus("idle"), 3000);
      setResumeFile(null);
    } catch {
      setUploadStatus("error");
      setTimeout(() => setUploadStatus("idle"), 3000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Settings & Operations
        </h1>
        <p className="text-neutral-400">
          Manage your profile, resume, and run manual scrapes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Resume Upload */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-inner">
            <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
              <FileType className="w-5 h-5 text-blue-400" />
              Resume Configuration
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              Upload the PDF resume you want to attach to your automated
              outreach emails.
            </p>

            <div className="flex flex-col gap-4">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-neutral-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-neutral-800 file:text-neutral-200
                  hover:file:bg-neutral-700 hover:file:cursor-pointer transition-colors"
              />
              <button
                onClick={handleResumeUpload}
                disabled={!resumeFile || uploadStatus === "uploading"}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadStatus === "uploading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                {uploadStatus === "uploading"
                  ? "Uploading..."
                  : uploadStatus === "success"
                    ? "Upload Complete!"
                    : uploadStatus === "error"
                      ? "Upload Failed"
                      : "Upload New Resume"}
              </button>
            </div>
          </section>

          {/* Environment Config Info */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-white">
              System Configuration
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              All other configuration (AI provider, LinkedIn search keywords,
              templates, daily limits) is managed via the{" "}
              <code className="bg-neutral-800 px-1 py-0.5 rounded text-blue-300">
                .env
              </code>{" "}
              file on your local machine to ensure privacy.
            </p>
            <div className="bg-neutral-950 p-4 rounded-lg font-mono text-xs text-neutral-300 border border-neutral-800 space-y-2">
              <div className="flex justify-between">
                <span>AI_PROVIDER:</span>{" "}
                <span className="text-green-400">claude/grok/ollama</span>
              </div>
              <div className="flex justify-between">
                <span>DAILY_SEND_LIMIT:</span>{" "}
                <span className="text-green-400">Managed in backend</span>
              </div>
              <div className="flex justify-between">
                <span>CRON_SCHEDULE:</span>{" "}
                <span className="text-green-400">Automated daily</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-300 mb-3 block">
                CLI Authentication Tools
              </h3>
              <p className="text-xs text-neutral-500 mb-3">
                Run these commands in your terminal to re-authenticate:
              </p>
              <div className="space-y-2">
                <code className="block bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-xs text-blue-300 font-mono">
                  python cli.py auth-linkedin
                </code>
                <code className="block bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-xs text-blue-300 font-mono">
                  python cli.py auth-gmail
                </code>
              </div>
            </div>
          </section>
        </div>

        {/* Manual Scrape Trigger */}
        <div className="space-y-6 flex flex-col">
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-md border-t-4 border-t-blue-500 flex flex-col h-full gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-2 text-white">
                Manual Scrape
              </h2>
              <p className="text-sm text-neutral-400">
                Trigger an immediate background scrape. Progress will appear in
                the live log below.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={scrapeTarget}
                onChange={(e) => setScrapeTarget(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors flex-1 text-neutral-200"
              >
                <option value="all">All Sites (LinkedIn + Naukri)</option>
                <option value="linkedin">LinkedIn Only</option>
                <option value="naukri">Naukri Only</option>
              </select>

              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {scrapeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {scrapeMutation.isPending ? "Starting..." : "Run Scraper"}
              </button>
            </div>

            <div className="flex-1 min-h-[300px] mt-4">
              <CrawlLog />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
