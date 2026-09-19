"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectSchedule } from "@/hooks/schedule/useProjectSchedule";
import ProjectPlanner from "./ProjectPlanner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useSchedule } from "@/hooks/schedule/useSchedule";
import type { ScheduleCard } from "@/types/schedule/schedule";
import PlannerSync from "./PlannerSync";
import ScheduleCalendar from "./ScheduleCalendar";
import ScheduleToolbar from "./ScheduleToolbar";
import ScheduleList from "./ScheduleList";
import ScheduleCardDialog from "./ScheduleCardDialog";
export default function ScheduleBoard({
  initialBoardId,
  initialCardId,
  initialDate,
}: {
  initialBoardId?: string;
  initialCardId?: string;
  initialDate?: string;
}) {
  const schedule = useSchedule(initialBoardId);
  const router = useRouter();
  const { deadlines, error: deadlineError } = useProjectSchedule();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [addingList, setAddingList] = useState(false);
  const [listTitle, setListTitle] = useState("");
  const [editor, setEditor] = useState<{
    boardId?: string;
    listId: string;
    card?: ScheduleCard;
  } | null>(null);
  const [linkedCardClosed, setLinkedCardClosed] = useState(false);
  if (schedule.loading)
    return <ContentSkeleton label="Loading schedule" variant="calendar" />;
  if (!schedule.board || !schedule.state)
    return (
      <div className="space-y-5">
        <ScheduleCalendar cards={[]} onOpen={() => {}} status="unavailable" />
        <div className="rounded-xl border bg-background p-8 text-center">
          <h2 className="font-semibold">Schedule unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground" role="alert">
            {schedule.error}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  const board = schedule.board;
  const linkedCard = !linkedCardClosed
    ? board.cards.find((card) => card.id === initialCardId)
    : undefined;
  const activeEditor =
    editor ??
    (linkedCard ? { listId: linkedCard.listId, card: linkedCard } : null);
  const editorBoard =
    schedule.state.boards.find((item) => item.id === editor?.boardId) ?? board;
  const allCards = [
    ...schedule.state.boards.flatMap((item) => item.cards),
    ...deadlines.filter((card) => card.stage !== "Done"),
  ];
  const query = search.trim().toLowerCase();
  const visible = board.cards.filter(
    (card) =>
      (!query ||
        [card.title, card.description].some((value) =>
          value.toLowerCase().includes(query),
        )) &&
      (priority === "all" || card.priority === priority),
  );
  function resetView() {
    setSearch("");
    setPriority("all");
    setEditor(null);
    setLinkedCardClosed(true);
    setAddingList(false);
    setListTitle("");
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PlannerSync />
      {deadlineError && (
        <p role="alert" className="text-sm text-destructive">
          {deadlineError}
        </p>
      )}
      <Tabs defaultValue="calendar" className="w-full min-w-0">
        <TabsList className="mb-5 h-auto w-fit max-w-full rounded-xl border bg-muted/60 p-1">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="planner">Planner</TabsTrigger>
        </TabsList>
        <TabsContent
          value="calendar"
          forceMount
          className="space-y-4 data-[state=inactive]:hidden"
        >
          <ScheduleCalendar
            initialDate={initialDate}
            cards={allCards}
            onOpen={(card) => {
              const linked = deadlines.find((item) => item.id === card.id);
              if (linked) {
                router.push(linked.href);
                return;
              }
              const owner = schedule.state?.boards.find((item) =>
                item.cards.includes(card),
              );
              if (owner)
                setEditor({ boardId: owner.id, listId: card.listId, card });
            }}
          />
        </TabsContent>
        <TabsContent
          value="planner"
          forceMount
          className="space-y-5 data-[state=inactive]:hidden"
        >
          <ScheduleToolbar
            boards={schedule.state.boards}
            board={board}
            search={search}
            priority={priority}
            onSearch={setSearch}
            onPriority={setPriority}
            onSelect={(id) => {
              resetView();
              schedule.selectBoard(id);
            }}
            onCreate={(title) => {
              const saved = schedule.addBoard(title);
              if (saved) resetView();
              return saved;
            }}
            onRename={schedule.renameBoard}
          />
          <ProjectPlanner
            cards={deadlines}
            search={query}
            priority={priority}
          />
          {schedule.error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {schedule.error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Columns3 className="h-4 w-4" />
              {board.lists.length} lists<span aria-hidden="true">/</span>
              {visible.length} of {board.cards.length} cards
            </span>
            {query || priority !== "all" ? (
              <button
                className="text-primary underline"
                onClick={() => {
                  setSearch("");
                  setPriority("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <span>Drag cards between lists, or open a card to move it.</span>
            )}
          </div>
          <div
            aria-label={board.title + " board"}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5"
          >
            {board.lists.map((list) => (
              <ScheduleList
                key={list.id}
                list={list}
                cards={visible.filter((card) => card.listId === list.id)}
                total={
                  board.cards.filter((card) => card.listId === list.id).length
                }
                onAdd={() => setEditor({ listId: list.id })}
                onOpen={(card) => setEditor({ listId: list.id, card })}
                onMove={(id, beforeId) =>
                  schedule.moveCard(id, list.id, beforeId)
                }
                onRename={(title) => schedule.renameList(list.id, title)}
                onDelete={() => schedule.deleteList(list.id)}
              />
            ))}
            <div className="w-full min-w-0">
              {addingList ? (
                <form
                  className="space-y-3 rounded-xl border bg-background p-3 shadow-sm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (schedule.addList(listTitle)) {
                      setListTitle("");
                      setAddingList(false);
                    }
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="New list name"
                    placeholder="Enter list name..."
                    maxLength={60}
                    value={listTitle}
                    onChange={(event) => setListTitle(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!listTitle.trim()}
                    >
                      Add list
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingList(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="ghost"
                  className="h-12 w-full justify-start rounded-xl border border-dashed bg-background/50 text-muted-foreground"
                  onClick={() => setAddingList(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add another list
                </Button>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {activeEditor && (
        <ScheduleCardDialog
          key={editorBoard.id + (activeEditor.card?.id ?? activeEditor.listId)}
          card={activeEditor.card}
          listId={activeEditor.listId}
          lists={editorBoard.lists}
          onClose={() => {
            setEditor(null);
            setLinkedCardClosed(true);
          }}
          onSave={(draft, id) => schedule.saveCard(draft, id, editorBoard.id)}
          onDelete={(id) => schedule.deleteCard(id, editorBoard.id)}
        />
      )}
    </div>
  );
}
