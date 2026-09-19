"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  createScheduleBoard,
  loadSchedule,
  saveSchedule,
} from "@/services/schedule/scheduleService";
import type {
  ScheduleBoard,
  ScheduleCardDraft,
  ScheduleState,
} from "@/types/schedule/schedule";
export function useSchedule(initialBoardId?: string) {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<ScheduleState | null>(null);
  const owner = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const initialize = (userId: string | null) => {
      if (!alive) return;
      owner.current = userId;
      current.current = null;
      setState(null);
      try {
        if (!userId) throw new Error("Sign in to use your schedule.");
        const next = loadSchedule(userId);
        if (
          initialBoardId &&
          next.boards.some((board) => board.id === initialBoardId)
        )
          next.activeBoardId = initialBoardId;
        current.current = next;
        setState(next);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load your schedule.",
        );
      }
      setLoading(false);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      revision += 1;
      if (session?.user.id !== owner.current || !current.current)
        initialize(session?.user.id ?? null);
    });
    const requestRevision = revision;
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!alive || revision !== requestRevision) return;
        if (error) {
          setError("Unable to load your account. Please reload and try again.");
          setLoading(false);
        } else initialize(data.user?.id ?? null);
      })
      .catch(() => {
        if (alive && revision === requestRevision) {
          setError("Unable to load your account.");
          setLoading(false);
        }
      });
    const refresh = () => {
      if (!alive || !owner.current) return;
      try {
        const next = loadSchedule(owner.current);
        current.current = next;
        setState(next);
        setError(null);
      } catch {
        setError("Unable to refresh your saved schedule.");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "worksync:schedule:v1:" + owner.current
      )
        refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("worksync:schedule-updated", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("worksync:schedule-updated", refresh);
      alive = false;
      subscription.unsubscribe();
      owner.current = null;
      current.current = null;
    };
  }, [initialBoardId]);
  function commit(next: ScheduleState): boolean {
    if (!owner.current) return false;
    try {
      saveSchedule(owner.current, next);
      current.current = next;
      setState(next);
      setError(null);
      return true;
    } catch {
      setError(
        "Changes could not be saved in this browser. Your previous board is unchanged; free up browser storage and try again.",
      );
      return false;
    }
  }
  function updateBoard(
    change: (board: ScheduleBoard) => ScheduleBoard,
    boardId?: string,
  ) {
    const snapshot = current.current;
    if (!snapshot) return false;
    return commit({
      ...snapshot,
      boards: snapshot.boards.map((board) =>
        board.id === (boardId ?? snapshot.activeBoardId)
          ? change(board)
          : board,
      ),
    });
  }
  return {
    state,
    loading,
    error,
    board: state?.boards.find((b) => b.id === state.activeBoardId) ?? null,
    selectBoard: (id: string) => {
      const snapshot = current.current;
      if (snapshot?.boards.some((b) => b.id === id))
        commit({ ...snapshot, activeBoardId: id });
    },
    addBoard: (title: string) => {
      const snapshot = current.current;
      if (!snapshot || !title.trim()) return false;
      const board = createScheduleBoard(title.trim());
      return commit({
        boards: [...snapshot.boards, board],
        activeBoardId: board.id,
      });
    },
    renameBoard: (title: string) =>
      title.trim()
        ? updateBoard((b) => ({ ...b, title: title.trim() }))
        : false,
    addList: (title: string) =>
      title.trim()
        ? updateBoard((b) => ({
            ...b,
            lists: [
              ...b.lists,
              { id: crypto.randomUUID(), title: title.trim() },
            ],
          }))
        : false,
    renameList: (id: string, title: string) =>
      title.trim()
        ? updateBoard((b) => ({
            ...b,
            lists: b.lists.map((l) =>
              l.id === id ? { ...l, title: title.trim() } : l,
            ),
          }))
        : false,
    deleteList: (id: string) =>
      updateBoard((b) =>
        b.cards.some((c) => c.listId === id)
          ? b
          : { ...b, lists: b.lists.filter((l) => l.id !== id) },
      ),
    saveCard: (draft: ScheduleCardDraft, id?: string, boardId?: string) =>
      updateBoard((b) => {
        if (!draft.title.trim() || !b.lists.some((l) => l.id === draft.listId))
          return b;
        const card = {
          ...draft,
          title: draft.title.trim(),
          id: id ?? crypto.randomUUID(),
        };
        return {
          ...b,
          cards: id
            ? b.cards.map((c) => (c.id === id ? card : c))
            : [...b.cards, card],
        };
      }, boardId),
    deleteCard: (id: string, boardId?: string) =>
      updateBoard(
        (b) => ({ ...b, cards: b.cards.filter((c) => c.id !== id) }),
        boardId,
      ),
    moveCard: (id: string, listId: string, beforeId?: string) =>
      updateBoard((b) => {
        const card = b.cards.find((c) => c.id === id);
        if (!card || id === beforeId || !b.lists.some((l) => l.id === listId))
          return b;
        const cards = b.cards.filter((c) => c.id !== id);
        const index = beforeId
          ? cards.findIndex((c) => c.id === beforeId && c.listId === listId)
          : -1;
        cards.splice(index < 0 ? cards.length : index, 0, { ...card, listId });
        return { ...b, cards };
      }),
  };
}
