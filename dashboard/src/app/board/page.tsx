import KanbanBoard from "@/components/KanbanBoard";

export default function BoardPage() {
  return (
    <div className="flex flex-col h-full -mx-4 px-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Outreach Pipeline</h1>
        <p className="text-neutral-400 text-sm hidden sm:block">
          Drag and drop cards to update status. Click a card to read the AI
          drafted email.
        </p>
      </div>

      <KanbanBoard />
    </div>
  );
}
