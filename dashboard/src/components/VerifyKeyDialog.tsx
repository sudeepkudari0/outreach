"use client";

import { useState } from "react";
import { Key, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function VerifyKeyDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  const {
    mutate: verifyKey,
    isPending,
    error,
    reset,
  } = useMutation({
    mutationFn: () => api.agent.verifyKey(),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const handleVerify = () => {
    setResult(null);
    reset();
    verifyKey();
  };

  return (
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
      <DialogTrigger
        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/50 rounded-md transition-colors"
        title="Verify Grok Key"
      >
        <Key className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-500" />
            Verify Grok API Key
          </DialogTitle>
          <DialogDescription className="text-neutral-400 mt-2">
            Check if your Grok key in the backend `.env` file is valid and
            active.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isPending ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
              <p className="text-sm text-neutral-400">
                Verifying key with x.ai...
              </p>
            </div>
          ) : result ? (
            <div className="p-4 rounded-xl bg-green-900/10 border border-green-900/30 space-y-3">
              <div className="flex items-center gap-2 text-green-400 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                <span>Verification Successful</span>
              </div>
              <p className="text-sm text-green-400/80">
                {result.detail || "Your API key is active and ready."}
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">
                  Verification Failed
                </p>
                <p className="text-xs text-red-400/80 mt-1">
                  {(error as Error).message}
                </p>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <button
                onClick={handleVerify}
                className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 border border-neutral-700"
              >
                <Key className="w-4 h-4" />
                Test API Connection
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
