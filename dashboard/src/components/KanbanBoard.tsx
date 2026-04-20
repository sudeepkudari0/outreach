"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "@/lib/api";
import JobCard from "./JobCard";
import {
  Loader2,
  Table2,
  LayoutGrid,
  ExternalLink,
  Filter,
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
];

export default function KanbanBoard() {
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"emails" | "manual">("manual");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visitedJobs, setVisitedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsMounted(true);
    // Load visited jobs from localStorage
    const stored = localStorage.getItem("visitedJobs");
    if (stored) {
      setVisitedJobs(new Set(JSON.parse(stored)));
    }
  }, []);

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
  const jobs = allJobs.filter((job) => job.status !== "ignored");

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

  if (!isMounted)
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );

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
    <div className="mt-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1 bg-neutral-900 p-1 rounded-lg">
          <button
            onClick={() => setViewMode("emails")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === "manual"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Table2 className="w-4 h-4" />
            Manual
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200"
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

      {viewMode === "emails" ? (
        <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4 custom-scrollbar">
          <DragDropContext onDragEnd={onDragEnd}>
            {activeColumns.map((col) => {
              const columnJobs =
                statusFilter === "all" || statusFilter === col.id
                  ? jobsByStatus[col.id] || []
                  : [];
              return (
                <div
                  key={col.id}
                  className="min-w-[300px] w-[300px] flex flex-col flex-shrink-0"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Job Title
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Company
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Source
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Notes
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-neutral-400 font-medium">
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    No jobs found.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const isVisited = visitedJobs.has(job.id);
                  return (
                    <tr
                      key={job.id}
                      className={`border-b border-neutral-800 hover:bg-neutral-900/50 ${
                        isVisited ? "bg-blue-900/10" : ""
                      }`}
                    >
                      <td className="py-3 px-4 text-white max-w-[200px] truncate">
                        {job.title}
                      </td>
                      <td className="py-3 px-4 text-neutral-300">
                        {job.company || "-"}
                      </td>
                      <td className="py-3 px-4 text-neutral-300 uppercase text-xs">
                        {job.source_site}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={job.status}
                          onChange={(e) =>
                            handleStatusChange(job.id, e.target.value)
                          }
                          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm text-neutral-200"
                        >
                          {MANUAL_COLUMNS.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          defaultValue={job.notes || ""}
                          placeholder="Add notes..."
                          onBlur={(e) => {
                            if (e.target.value !== (job.notes || "")) {
                              handleNotesChange(job.id, e.target.value);
                            }
                          }}
                          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm text-neutral-200 w-[150px] placeholder-neutral-600"
                        />
                      </td>
                      <td className="py-3 px-4 text-neutral-400">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleVisitJob(job.id)}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
