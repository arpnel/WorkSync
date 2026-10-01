"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectSchedule } from "@/hooks/schedule/useProjectSchedule";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import SharedProjectBoard from "./SharedProjectBoard";
import { buildProjectBoards } from "@/lib/projectSchedule";
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
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [projectBoardId, setProjectBoardId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [listTitle, setListTitle] = useState("");
  const [editor, setEditor] = useState<{
    boardId?: string;
    listId: string;
    card?: ScheduleCard;
    dueDate?: string;
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
  const projectBoards = buildProjectBoards(deadlines);
  const projectBoard = projectBoards.find((item) => item.id === projectBoardId);
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
  function resetView() {
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
      <ScheduleCalendar
        initialDate={initialDate}
        onCreateDeadline={(date) => {
          const list = board.lists[0];
          if (list)
            setEditor({ boardId: board.id, listId: list.id, dueDate: date });
          else setPlannerOpen(true);
        }}
        onOpenPlanner={() => {
          setProjectBoardId(null);
          setPlannerOpen(true);
        }}
        onViewPlanner={(card) => {
          const linked = deadlines.find(
            (item) => item.id === card.id && item.kind !== "meeting",
          );
          if (linked) {
            resetView();
            setProjectBoardId(`linked-project:${linked.projectKey}`);
            setPlannerOpen(true);
            return;
          }
          const owner = schedule.state?.boards.find((item) =>
            item.cards.some((candidate) => candidate.id === card.id),
          );
          if (!owner || card.entryType !== "plan") return;
          resetView();
          setProjectBoardId(null);
          schedule.selectBoard(owner.id);
          setPlannerOpen(true);
        }}
        cards={allCards}
        onOpen={(card) => {
          const linked = deadlines.find((item) => item.id === card.id);
          if (linked) {
            if (linked.kind === "meeting") router.push(linked.href);
            else {
              resetView();
              setProjectBoardId(`linked-project:${linked.projectKey}`);
              setPlannerOpen(true);
            }
            return;
          }
          const owner = schedule.state?.boards.find((item) =>
            item.cards.includes(card),
          );
          if (owner)
            setEditor({ boardId: owner.id, listId: card.listId, card });
        }}
      />
      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Plan board</DialogTitle>
            <DialogDescription>
              Organize boards and lists, or open a plan to update its details.
            </DialogDescription>
          </DialogHeader>
          <ScheduleToolbar
            key={projectBoard?.id ?? board.id}
            boards={[...schedule.state.boards, ...projectBoards]}
            board={projectBoard ?? board}
            readOnly={!!projectBoard}
            onSelect={(id) => {
              resetView();
              if (projectBoards.some((item) => item.id === id))
                setProjectBoardId(id);
              else {
                setProjectBoardId(null);
                schedule.selectBoard(id);
              }
            }}
            onCreate={(title) => {
              const saved = schedule.addBoard(title);
              if (saved) {
                resetView();
                setProjectBoardId(null);
              }
              return saved;
            }}
            onRename={schedule.renameBoard}
          />
          {schedule.error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {schedule.error}
            </p>
          )}
          {projectBoard ? (
            <SharedProjectBoard board={projectBoard} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Columns3 className="h-4 w-4" />
                  {board.lists.length} lists<span aria-hidden="true">/</span>
                  {board.cards.length} cards
                </span>
                <span>
                  Drag cards between lists, or open a card to edit it.
                </span>
              </div>
              <div
                aria-label={board.title + " board"}
                className="grid min-h-64 min-w-0 grid-cols-1 items-start gap-4 rounded-xl bg-muted/40 p-3 sm:flex sm:overflow-x-auto sm:pb-5 sm:[&>*]:w-72 sm:[&>*]:shrink-0"
              >
                {board.lists.map((list) => (
                  <ScheduleList
                    key={list.id}
                    list={list}
                    cards={board.cards.filter(
                      (card) => card.listId === list.id,
                    )}
                    total={
                      board.cards.filter((card) => card.listId === list.id)
                        .length
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
            </>
          )}
        </DialogContent>
      </Dialog>
      {activeEditor && (
        <ScheduleCardDialog
          key={
            editorBoard.id +
            (activeEditor.card?.id ?? activeEditor.listId) +
            (editor?.dueDate ?? "")
          }
          initialDueDate={
            "dueDate" in activeEditor ? activeEditor.dueDate : undefined
          }
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
