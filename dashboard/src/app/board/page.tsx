import KanbanBoard from "@/components/KanbanBoard";

export default function BoardPage() {
  return (
    <div className="flex flex-col h-full -mx-2 px-2 sm:-mx-4 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Outreach Pipeline</h1>
        <p className="text-neutral-400 text-sm sm:text-right">
          Drag and drop cards to update status. Click a card to read the AI
          drafted email.
        </p>
      </div>

      <KanbanBoard />
    </div>
  );
}
