import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircleMore, Paperclip, SendHorizonal } from "lucide-react";

const conversations = [
  { name: "Mina Chen", role: "Product Designer", preview: "Can you share the revised mockups?", active: true },
  { name: "Drew Alvarez", role: "Marketing Lead", preview: "The campaign brief is ready for review.", active: false },
  { name: "Riley Patel", role: "Developer", preview: "I pushed the latest fixes to staging.", active: false },
];

const messages = [
  { sender: "them", text: "Hi! I reviewed the latest draft and have a few notes." },
  { sender: "me", text: "Perfect, I can update them before tomorrow morning." },
  { sender: "them", text: "Great, I will also send the final brief shortly." },
];

export default function Page() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-[72vh]">
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Recent conversations with your clients and collaborators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.name}
              type="button"
              className={`w-full rounded-xl border p-3 text-left transition ${conversation.active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{conversation.name}</p>
                <MessageCircleMore className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{conversation.role}</p>
              <p className="mt-2 text-sm">{conversation.preview}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex h-[72vh] flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Mina Chen</CardTitle>
              <CardDescription>Product Designer · Project update</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              View project
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`flex ${message.sender === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${message.sender === "me" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="text-sm">{message.text}</p>
              </div>
            </div>
          ))}
        </CardContent>

        <div className="border-t p-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input placeholder="Write a message..." />
            <Button size="icon">
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
