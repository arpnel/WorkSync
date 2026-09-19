"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Ban,
  Files,
  X,
  Pin,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ChatDetails from "./ChatDetails";
import type { ChatMessage } from "@/types/message/message";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
interface Props {
  userId: string;
  name: string;
  archived: boolean;
  pinned: boolean;
  blocked: boolean;
  disabled: boolean;
  onArchive: () => void;
  onPin: () => void;
  onBlock: () => void;
  avatar?: string;
  role?: string;
  project?: string;
  messages: ChatMessage[];
  loading: boolean;
  onClose: () => void;
  onSearch: () => void;
}
export default function ChatActions({
  userId,
  name,
  archived,
  pinned,
  blocked,
  disabled,
  onArchive,
  onPin,
  onBlock,
  avatar,
  role,
  project,
  messages,
  loading,
  onClose,
  onSearch,
}: Props) {
  const [sharedOpen, setSharedOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="chat-panel-title" className="font-semibold">
          Chat details
        </h2>
        <Button
          autoFocus
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close chat details"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      {sharedOpen ? (
        <ChatDetails
          messages={messages}
          loading={loading}
          onClose={() => setSharedOpen(false)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatar} alt={name} />
              <AvatarFallback>
                {name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h3 className="max-w-full break-words text-lg font-semibold">
              {name}
            </h3>
            {role && <p className="text-sm text-muted-foreground">{role}</p>}
            {project && (
              <p className="max-w-full rounded-lg bg-muted px-3 py-2 text-sm break-words text-muted-foreground">
                {project}
              </p>
            )}
          </div>
          <div className="space-y-1">
            {userId && (
              <Button
                asChild
                variant="ghost"
                className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
              >
                <Link href={"/home/profile/" + userId}>
                  <UserRound className="h-4 w-4 shrink-0" />
                  View profile
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={onSearch}
            >
              <Search className="h-4 w-4 shrink-0" />
              Search in conversation
            </Button>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left"
              onClick={() => setSharedOpen(true)}
            >
              <Files className="h-4 w-4 shrink-0" />
              Shared media, files & links
            </Button>
          </div>
          <div className="mt-4 space-y-1 border-t pt-4">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              disabled={disabled}
              onClick={onPin}
            >
              <Pin className="h-4 w-4" />
              {pinned ? "Unpin chat" : "Pin chat"}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              disabled={disabled}
              onClick={onArchive}
            >
              {archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {archived ? "Restore to inbox" : "Archive chat"}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              disabled={disabled || !userId}
              onClick={() => (blocked ? onBlock() : setConfirm(true))}
            >
              <Ban className="h-4 w-4" />
              {blocked ? "Unblock user" : "Block user"}
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Neither of you will be able to send new messages to each other in
              WorkSync. Your conversation history stays available. Blocking does
              not cancel projects, contracts, or payment obligations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={disabled} onClick={onBlock}>
              Block user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
