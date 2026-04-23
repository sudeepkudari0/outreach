"use client";

import { useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "@/lib/api";
import JobCard from "./JobCard";
import AgentDialog from "./AgentDialog";
import EmailDialog from "./EmailDialog";
import {
  Loader2,
  Table2,
  LayoutGrid,
  ExternalLink,
  Filter,
  User,
  Mail,
  Eye,
  Bot,
} from "lucide-react";

const COLUMNS = [
  {
    id: "found",
    title: "Found",
    color: "bg-neutral-800/50 border-neutral-800",
  },
  {
    id: "drafted",
    title: "Drafted",
    color: "bg-blue-900/20 border-blue-900/50",
  },
  {
    id: "approved",
    title: "Approved",
    color: "bg-amber-900/20 border-amber-900/50",
  },
  { id: "sent", title: "Sent", color: "bg-green-900/20 border-green-900/50" },
  {
    id: "replied",
    title: "Replied",
    color: "bg-purple-900/20 border-purple-900/50",
  },
];

const MANUAL_COLUMNS = [
  {
    id: "found",
    title: "To Apply",
    color: "bg-neutral-800/50 border-neutral-800",
  },
  {
    id: "applied",
    title: "Applied",
    color: "bg-cyan-900/20 border-cyan-900/50",
  },
  { id: "ignored", title: "Ignored", color: "bg-red-900/20 border-red-900/50" },
  {
    id: "sent",
    title: "Email Sent",
    color: "bg-green-900/20 border-green-900/50",
  },
];

export default function KanbanBoard() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"emails" | "manual">("manual");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visitedJobs, setVisitedJobs] = useState<Set<string>>(new Set());
  const [shownEmails, setShownEmails] = useState<Set<string>>(new Set());
  const [isRunningAgents, setIsRunningAgents] = useState(false);
  const [agentProgress, setAgentProgress] = useState({ current: 0, total: 0 });

  const runAllAgents = async () => {
    if (jobs.length === 0) {
      alert("No jobs to run agents on.");
      return;
    }

    setIsRunningAgents(true);
    setAgentProgress({ current: 0, total: jobs.length });

    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        try {
          await api.agent.run(job.source_url, job.id);
        } catch (error) {
          console.error(`Failed to run agent for job ${job.title}`, error);
        }
        setAgentProgress({ current: i + 1, total: jobs.length });

        queryClient.invalidateQueries({ queryKey: ["jobs", viewMode] });

        if (i < jobs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      }
    } finally {
      setIsRunningAgents(false);
      setTimeout(() => setAgentProgress({ current: 0, total: 0 }), 2000);
    }
  };

  const toggleEmail = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShownEmails((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleVisitJob = (jobId: string) => {
    const newVisited = new Set(visitedJobs).add(jobId);
    setVisitedJobs(newVisited);
    localStorage.setItem("visitedJobs", JSON.stringify([...newVisited]));
  };

  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", viewMode],
    queryFn: () => api.jobs.list(undefined, undefined, viewMode),
    refetchInterval: 10000,
  });

  // Filter out ignored by default
  const jobs = allJobs.filter(
    (job) => job.status === "found" || job.status === "drafted",
  );

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.jobs.updateStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({
        queryKey: ["jobs", viewMode, statusFilter],
      });
      queryClient.setQueryData<Job[]>(
        ["jobs", viewMode, statusFilter],
        (old) => {
          if (!old) return [];
          return old.map((job) => (job.id === id ? { ...job, status } : job));
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["jobs", viewMode, statusFilter],
      });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.jobs.updateNotes(id, notes),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["jobs", viewMode, statusFilter],
      });
    },
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    if (destination.droppableId !== source.droppableId) {
      updateStatusMutation.mutate({
        id: draggableId,
        status: destination.droppableId,
      });
    }
  };

  const handleStatusChange = (jobId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: jobId, status: newStatus });
  };

  const handleNotesChange = (jobId: string, notes: string) => {
    updateNotesMutation.mutate({ id: jobId, notes });
  };

  const activeColumns = viewMode === "emails" ? COLUMNS : MANUAL_COLUMNS;

  const jobsByStatus = activeColumns.reduce(
    (acc, col) => {
      acc[col.id] = jobs.filter((job) => job.status === col.id);
      return acc;
    },
    {} as Record<string, Job[]>,
  );

  const filterOptions = [
    { id: "all", label: "All" },
    ...activeColumns
      .filter((c) => c.id !== "ignored")
      .map((c) => ({ id: c.id, label: c.title })),
  ];

  return (
    <div className="mt-4 space-y-4 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1 bg-neutral-900 p-1 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setViewMode("emails")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "emails"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Emails
          </button>
          <button
            onClick={() => setViewMode("manual")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "manual"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Table2 className="w-4 h-4" />
            Manual
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            onClick={runAllAgents}
            disabled={isRunningAgents}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium justify-center w-full sm:w-auto ${
              isRunningAgents
                ? "bg-blue-600/50 text-white cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {isRunningAgents ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
            {isRunningAgents && agentProgress.total > 0
              ? `Running (${agentProgress.current}/${agentProgress.total})`
              : "Run All Agents"}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-neutral-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 w-full sm:w-auto"
            >
              {filterOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} (
                  {opt.id === "all"
                    ? jobs.length
                    : (jobsByStatus[opt.id] || []).length}
                  )
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {viewMode === "emails" ? (
        <div className="flex gap-4 h-[calc(100dvh-260px)] sm:h-[calc(100vh-190px)] overflow-x-auto pb-4 custom-scrollbar">
          <DragDropContext onDragEnd={onDragEnd}>
            {activeColumns.map((col) => {
              const columnJobs =
                statusFilter === "all" || statusFilter === col.id
                  ? jobsByStatus[col.id] || []
                  : [];
              return (
                <div
                  key={col.id}
                  className="w-[86vw] min-w-[86vw] sm:w-[320px] sm:min-w-[320px] flex flex-col flex-shrink-0"
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="font-medium text-sm text-neutral-300">
                      {col.title}
                    </h3>
                    <span className="bg-neutral-800 text-neutral-400 text-xs py-0.5 px-2 rounded-full">
                      {columnJobs.length}
                    </span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 rounded-xl border border-dashed overflow-y-auto custom-scrollbar ${
                          col.color
                        } ${
                          snapshot.isDraggingOver
                            ? "bg-opacity-50 border-neutral-500 border-solid"
                            : "bg-opacity-30 border-transparent"
                        }`}
                      >
                        {isLoading && columnJobs.length === 0 ? (
                          <div className="h-full flex items-center justify-center opacity-50">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        ) : (
                          columnJobs.map((job, index) => (
                            <JobCard key={job.id} job={job} index={index} />
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </DragDropContext>
        </div>
      ) : (
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-10 text-center text-neutral-500 bg-neutral-900/30 border border-neutral-800 rounded-xl">
              No jobs found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {jobs.map((job) => {
                const isVisited = visitedJobs.has(job.id);
                return (
                  <article
                    key={job.id}
                    className={`rounded-xl border p-4 bg-neutral-900/40 ${
                      isVisited
                        ? "border-blue-500/40 ring-1 ring-blue-500/25"
                        : "border-neutral-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white line-clamp-2">
                        {job.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <EmailDialog job={job} />
                        <AgentDialog job={job} />
                        <a
                          href={job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleVisitJob(job.id)}
                          className="text-blue-400 hover:text-blue-300 mt-0.5"
                          aria-label="Open job post"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-neutral-300">
                      <p>
                        <span className="text-neutral-500">Company:</span>{" "}
                        {job.company || "-"}
                      </p>

                      {job.recruiter_name && (
                        <p className="flex items-center gap-1.5 text-neutral-300">
                          <User className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
                          <span className="truncate">{job.recruiter_name}</span>
                        </p>
                      )}

                      {job.email && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
                          {shownEmails.has(job.id) ? (
                            <span
                              className="truncate hover:text-neutral-300 transition-colors"
                              title={job.email}
                            >
                              {job.email}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => toggleEmail(job.id, e)}
                              className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white transition-colors bg-neutral-800 px-1.5 py-0.5 rounded cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Show Email
                            </button>
                          )}
                        </div>
                      )}

                      <p className="uppercase tracking-wide">
                        <span className="text-neutral-500 normal-case">
                          Source:
                        </span>{" "}
                        {job.source_site}
                      </p>
                      <p>
                        <span className="text-neutral-500">Added:</span>{" "}
                        {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <label className="block">
                        <span className="text-xs text-neutral-500 mb-1 block">
                          Status
                        </span>
                        <select
                          value={job.status}
                          onChange={(e) =>
                            handleStatusChange(job.id, e.target.value)
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200"
                        >
                          {MANUAL_COLUMNS.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs text-neutral-500 mb-1 block">
                          Notes
                        </span>
                        <textarea
                          defaultValue={job.notes || ""}
                          placeholder="Add notes..."
                          rows={2}
                          onBlur={(e) => {
                            if (e.target.value !== (job.notes || "")) {
                              handleNotesChange(job.id, e.target.value);
                            }
                          }}
                          className="w-full resize-y min-h-16 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600"
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
