"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Job } from "@/lib/api";
import JobCard from "./JobCard";
import { Loader2 } from "lucide-react";

// Kanban columns configuration
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

export default function KanbanBoard() {
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);

  // Fix hydration issues with dnd
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch all jobs
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.jobs.list(),
    refetchInterval: 10000, // Poll every 10s for new scraped jobs
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.jobs.updateStatus(id, status),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previousJobs = queryClient.getQueryData<Job[]>(["jobs"]);

      queryClient.setQueryData<Job[]>(["jobs"], (old) => {
        if (!old) return [];
        return old.map((job) => (job.id === id ? { ...job, status } : job));
      });

      return { previousJobs };
    },
    onError: (_err, _newJob, context) => {
      // Revert if error
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs"], context.previousJobs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
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
      // Update status on drop in new column
      updateStatusMutation.mutate({
        id: draggableId,
        status: destination.droppableId,
      });
    }
  };

  if (!isMounted)
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );

  // Group jobs by status
  const jobsByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = jobs.filter((job) => job.status === col.id);
      return acc;
    },
    {} as Record<string, Job[]>,
  );

  return (
    <div className="mt-8 flex gap-4 h-[calc(100vh-140px)] overflow-x-auto pb-4 custom-scrollbar">
      <DragDropContext onDragEnd={onDragEnd}>
        {COLUMNS.map((col) => {
          const columnJobs = jobsByStatus[col.id] || [];

          return (
            <div
              key={col.id}
              className="min-w-[300px] w-[300px] flex flex-col flex-shrink-0"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-medium text-sm text-neutral-300">
                  {col.title}
                </h3>
                <span className="bg-neutral-800 text-neutral-400 text-xs py-0.5 px-2 rounded-full font-medium">
                  {columnJobs.length}
                </span>
              </div>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`
                      flex-1 p-2 rounded-xl border border-dashed transition-colors overflow-y-auto custom-scrollbar
                      ${col.color}
                      ${snapshot.isDraggingOver ? "bg-opacity-50 border-neutral-500 border-solid" : "bg-opacity-30 border-transparent"}
                    `}
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
  );
}
