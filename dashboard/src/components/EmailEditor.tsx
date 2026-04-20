"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type JobWithDraft } from "@/lib/api";
import { Sparkles, Save, Send, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function EmailEditor({ job }: { job: JobWithDraft }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const draft = job.draft;

  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");

  // Update state if draft changes
  useEffect(() => {
    if (draft) {
      setSubject(draft.subject || "");
      setBody(draft.body || "");
    }
  }, [draft]);

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const isOverLimit = wordCount > 150;

  // Mutations
  const updateMutation = useMutation({
    mutationFn: () => api.emails.updateDraft(job.id, subject, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.emails.regenerate(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.emails.approve(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      // Redirect to board after approve
      router.push("/board");
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => api.emails.send(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      router.push("/board");
    },
    onError: (err: Error) => {
      alert(`Error sending email: ${err.message}`);
    },
  });

  if (!draft) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 py-12 bg-neutral-900 rounded-xl border border-neutral-800">
        <Sparkles className="w-8 h-8 mb-4 opacity-50" />
        <p>No draft available.</p>
        <button
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {regenerateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generate with AI
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden shadow-xl">
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
        <h3 className="font-medium text-neutral-200 flex items-center gap-2">
          Email Draft
          {draft.edited && (
            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              Edited
            </span>
          )}
        </h3>

        <div className="flex items-center gap-2">
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="p-2 text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors disabled:opacity-50"
            title="Regenerate with AI"
          >
            <Sparkles
              className={`w-4 h-4 ${regenerateMutation.isPending ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="text-xs font-medium tracking-wide text-neutral-500 uppercase mb-1.5 block">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() => updateMutation.mutate()}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Body
            </label>
            <span
              className={`text-xs ${isOverLimit ? "text-red-400 font-bold" : "text-neutral-500"}`}
            >
              {wordCount} / 150 words
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => updateMutation.mutate()}
            className="w-full flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none font-sans leading-relaxed"
            placeholder="Email body..."
          />
        </div>
      </div>

      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex justify-between items-center">
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="text-neutral-500 hover:text-neutral-300 flex items-center gap-2 text-sm px-3 py-1.5 rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {updateMutation.isPending ? "Saving..." : "Save Draft"}
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending || job.status === "approved"}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-green-500" />
            )}
            {job.status === "approved" ? "Approved" : "Approve"}
          </button>

          <button
            onClick={() => {
              if (confirm("Are you sure you want to send this email now?")) {
                sendMutation.mutate();
              }
            }}
            disabled={
              sendMutation.isPending || !subject || !body || isOverLimit
            }
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendMutation.isPending ? "Sending..." : "Send Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
