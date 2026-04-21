"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import EmailEditor from "@/components/EmailEditor";
import {
  ArrowLeft,
  Building2,
  Globe,
  Briefcase,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function EmailDraftPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const {
    data: job,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.jobs.get(jobId),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );
  if (error || !job)
    return (
      <div className="text-center mt-20 text-red-400 font-medium">
        Failed to load job details.
      </div>
    );

  const SiteIcon = () => {
    switch (job.source_site) {
      case "linkedin":
        return <Briefcase className="w-4 h-4" />;
      case "naukri":
        return <Briefcase className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col pt-2">
      <button
        onClick={() => router.push("/board")}
        className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors w-fit mb-4 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Board
      </button>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left Side — Job Post Details */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 shadow-inner">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-neutral-800 text-neutral-300 text-xs font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1.5">
                <SiteIcon /> {job.source_site}
              </span>
              <span className="text-neutral-500 text-sm">
                Posted{" "}
                {formatDistanceToNow(new Date(job.created_at), {
                  addSuffix: true,
                })}
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-wider ml-auto px-2 py-1 rounded ${
                  job.status === "drafted"
                    ? "bg-blue-500/10 text-blue-400"
                    : job.status === "approved"
                      ? "bg-amber-500/10 text-amber-400"
                      : job.status === "sent"
                        ? "bg-green-500/10 text-green-400"
                        : job.status === "replied"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {job.status}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">
              {job.title}
            </h1>

            <div className="flex flex-col gap-2 text-neutral-400">
              {job.company && (
                <div className="flex items-center gap-2 text-lg text-neutral-300">
                  <Building2 className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium">{job.company}</span>
                </div>
              )}
              {job.recruiter_name && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-300 uppercase">
                    {job.recruiter_name.charAt(0)}
                  </div>
                  <span>
                    Hiring Manager:{" "}
                    <strong className="text-neutral-300 font-medium">
                      {job.recruiter_name}
                    </strong>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 mb-2">
                <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-300">
                  @
                </div>
                <span>
                  Recruiter Email:{" "}
                  <strong className="text-neutral-300 font-medium">
                    {job.email}
                  </strong>
                </span>
              </div>
              <Link
                href={job.source_url}
                target="_blank"
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors w-fit text-sm"
              >
                View original post <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-800/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
              Original Job Description
            </h3>
            <div className="prose prose-invert prose-sm max-w-none prose-p:text-neutral-300 prose-li:text-neutral-300 bg-neutral-950 p-4 rounded-lg border border-neutral-800 whitespace-pre-wrap font-sans text-sm">
              {job.raw_post_text}
            </div>
          </div>
        </div>

        {/* Right Side — Email Editor */}
        <div className="min-h-0">
          <EmailEditor job={job} />
        </div>
      </div>
    </div>
  );
}
