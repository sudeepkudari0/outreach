"use client";

import { useState, useEffect } from "react";
import { Send, Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function EmailDialog({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<
    "idle" | "updating" | "sending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: draft, isLoading: isDraftLoading } = useQuery({
    queryKey: ["emails", job.id],
    queryFn: () => api.emails.getDraft(job.id),
    enabled: isOpen,
    retry: false, // In case draft doesn't exist
  });

  useEffect(() => {
    if (draft) {
      setSubject(draft.subject || "");
      setBody(draft.body || "");
      setToEmail(job.email || "");
    } else if (job.email) {
      setToEmail(job.email);
    }
  }, [draft, job.email]);

  const handleSend = async () => {
    try {
      setStatus("updating");
      // 1. Update draft
      await api.emails.updateDraft(job.id, subject, body);

      setStatus("sending");
      // 2. Send email
      await api.emails.send(job.id, toEmail);

      setStatus("success");
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(
        err.message || "An error occurred while sending the email.",
      );
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state if closed
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage("");
      }, 200);
    }
  };

  if (!job.email || job.status === "sent" || job.status === "ignored") {
    return null;
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors bg-green-500/10 px-2 py-1 rounded-md border border-green-500/20 z-10 relative cursor-pointer">
          <Send className="w-3 h-3" />
          <span className="hidden sm:inline">Send</span>
        </DialogTrigger>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-2xl z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-green-500" />
              Review & Send Email
            </DialogTitle>
            <DialogDescription className="text-neutral-400 mt-2">
              Review and edit the email draft for <strong>{job.title}</strong>{" "}
              before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {status === "success" ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 p-4 rounded-xl bg-green-900/20 border border-green-900/50">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="font-medium text-green-400">
                  Email Sent Successfully!
                </p>
                <p className="text-sm text-green-400/80">
                  The job status has been updated to "Email Sent".
                </p>
                <button
                  onClick={() => handleOpenChange(false)}
                  className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            ) : status === "updating" || status === "sending" ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
                <p className="text-sm text-neutral-400">
                  {status === "updating"
                    ? "Saving draft changes..."
                    : "Sending email securely..."}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[60px_1fr] items-center gap-2 text-sm">
                  <span className="text-neutral-500 text-right">To:</span>
                  <input
                    type="text"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-green-500/50 transition-colors"
                  />

                  <span className="text-neutral-500 text-right">From:</span>
                  <input
                    type="text"
                    value="Configured Gmail Account"
                    readOnly
                    className="w-full bg-neutral-800/50 border border-neutral-800 rounded-lg px-3 py-1.5 text-neutral-500 italic focus:outline-none"
                  />
                </div>

                {isDraftLoading ? (
                  <div className="py-10 flex justify-center items-center flex-col gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                    <p className="text-sm text-neutral-500">Loading draft...</p>
                  </div>
                ) : !draft && !subject && !body ? (
                  <div className="py-8 text-center text-amber-500 bg-amber-900/10 border border-amber-900/20 rounded-xl">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm">No draft found for this job.</p>
                    <p className="text-xs mt-1 text-amber-400/80">
                      Please run the AI agent first to generate a draft.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-neutral-400 mb-1 block">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-green-500/50 transition-colors"
                        placeholder="Email subject..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-neutral-400 mb-1 block">
                        Body
                      </label>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full min-h-[250px] resize-y bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-green-500/50 transition-colors align-top"
                        placeholder="Email body..."
                      />
                    </div>

                    {status === "error" && (
                      <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/50 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400">{errorMessage}</p>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSend}
                        disabled={!subject || !body}
                        className="py-2.5 px-6 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                        Send Email
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
