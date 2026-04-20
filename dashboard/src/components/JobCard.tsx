"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Clock, Building2, Briefcase } from "lucide-react";
import type { Job } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

interface JobCardProps {
  job: Job;
  index: number;
}

export default function JobCard({ job, index }: JobCardProps) {
  const router = useRouter();

  const SiteIcon = () => {
    switch (job.source_site) {
      case "linkedin":
        return <Briefcase className="w-3 h-3" />;
      case "naukri":
        return <Briefcase className="w-3 h-3" />;
      default:
        return <Briefcase className="w-3 h-3" />;
    }
  };

  const getSiteColor = () => {
    switch (job.source_site) {
      case "linkedin":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "naukri":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";
    }
  };

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => router.push(`/emails/${job.id}`)}
          className={`
            p-3 mb-3 bg-neutral-900 border border-neutral-800 rounded-lg shadow-sm 
            cursor-pointer group flex flex-col gap-2 transition-all
            hover:border-neutral-700 hover:bg-neutral-800/80
            ${snapshot.isDragging ? "shadow-xl border-blue-500/50 scale-105 z-50 bg-neutral-800" : ""}
          `}
          style={{
            ...provided.draggableProps.style,
            // Ensure gap between cards
          }}
        >
          <div className="flex justify-between items-start gap-2">
            <h4 className="font-medium text-sm text-neutral-200 line-clamp-2 leading-tight group-hover:text-blue-400 transition-colors">
              {job.title}
            </h4>
            <div
              className={`flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${getSiteColor()}`}
            >
              <SiteIcon />
              <span>{job.source_site}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-neutral-500 mt-1">
            {job.company && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.company}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 flex items-center justify-center bg-neutral-800 text-[10px] rounded flex-shrink-0 font-medium">
                @
              </div>
              <span
                className="truncate hover:text-neutral-300 transition-colors"
                title={job.email}
              >
                {job.email}
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 mt-auto pt-2 border-t border-neutral-800/50">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>
                {formatDistanceToNow(new Date(job.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
