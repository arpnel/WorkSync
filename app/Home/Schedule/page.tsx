import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock3, Sparkles } from "lucide-react";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const calendarCells = Array.from({ length: 35 }, (_, index) => index + 1);
const upcomingEvents = [
  { title: "Client review", time: "09:00 AM", type: "Meeting" },
  { title: "Invoice follow-up", time: "02:30 PM", type: "Task" },
  { title: "Design handoff", time: "05:00 PM", type: "Deadline" },
];

export default function Page() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>Plan your week and keep important deadlines visible.</CardDescription>
            </div>
            <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              July 2026
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-muted-foreground">
            {days.map((day) => (
              <div key={day} className="rounded-lg bg-muted/50 px-2 py-2">
                {day}
              </div>
            ))}
            {calendarCells.map((cell) => (
              <div
                key={cell}
                className={`min-h-20 rounded-xl border p-2 text-left ${cell === 10 || cell === 15 || cell === 22 ? "bg-primary/10" : "bg-background"}`}
              >
                <div className="text-sm font-medium">{cell}</div>
                {cell === 10 ? <p className="mt-2 text-xs text-muted-foreground">Client call</p> : null}
                {cell === 15 ? <p className="mt-2 text-xs text-muted-foreground">Deadline</p> : null}
                {cell === 22 ? <p className="mt-2 text-xs text-muted-foreground">Review</p> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Your next priorities for the day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.map((event) => (
              <div key={event.title} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{event.title}</p>
                  <Badge variant="secondary">{event.type}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  {event.time}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Planner note
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The calendar view is ready for future enhancements like drag-and-drop, color-coded events, and a full month switcher.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
