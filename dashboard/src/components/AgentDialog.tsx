"use client";

import { useState } from "react";
import { Bot, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AgentDialog({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  const {
    mutate: runAgent,
    isPending,
    error,
    reset,
  } = useMutation({
    mutationFn: (data: { url: string; id: string }) =>
      api.agent.run(data.url, data.id),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const handleRunAgent = () => {
    setResult(null);
    reset();
    runAgent({ url: job.source_url, id: job.id });
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setResult(null);
            reset();
          }
        }}
      >
        <DialogTrigger className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/20 mr-2 sm:mr-0 z-10 relative">
          <Bot className="w-3 h-3" />
          <span>Run Agent</span>
        </DialogTrigger>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              AI Job Agent
            </DialogTitle>
            <DialogDescription className="text-neutral-400 mt-2">
              Run the agent for this job: <strong>{job.title}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isPending ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-neutral-400">
                  Agent is analyzing and drafting...
                </p>
              </div>
            ) : result ? (
              <div className="p-4 rounded-xl bg-neutral-800/50 border border-neutral-700 space-y-3">
                <div className="flex items-center gap-2 text-green-400 font-medium pb-2 border-b border-neutral-700/50">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Action Completed</span>
                </div>
                <div className="text-sm space-y-2 pt-2">
                  <p>
                    <span className="text-neutral-500">Recruiter:</span>{" "}
                    <span className="text-neutral-200">
                      {result.recruiter_name || "Unknown"}
                    </span>
                  </p>
                  <p>
                    <span className="text-neutral-500">Email:</span>{" "}
                    {result.recruiter_email ? (
                      <span className="text-green-400">
                        {result.recruiter_email}
                      </span>
                    ) : (
                      <span className="text-amber-400/80">
                        Not found / Guessed
                      </span>
                    )}
                  </p>
                  <p>
                    <span className="text-neutral-500">Status:</span>{" "}
                    <span className="text-neutral-200 capitalize">
                      {result.status}
                    </span>
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400">
                    Agent Error
                  </p>
                  <p className="text-xs text-red-400/80 mt-1">
                    {(error as Error).message}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-neutral-800/30 border border-neutral-800 text-sm text-neutral-300">
                <p className="mb-4">This will:</p>
                <ul className="list-disc pl-5 space-y-1 text-neutral-400 mb-6">
                  <li>Find the recruiter's verified email.</li>
                  <li>Generate a tailored outreach email.</li>
                  <li>Update this card on the board.</li>
                </ul>
                <button
                  onClick={handleRunAgent}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Bot className="w-4 h-4" />
                  Start Agent Workflow
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
