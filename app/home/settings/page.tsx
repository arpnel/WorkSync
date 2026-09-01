import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Bell, Lock, UserRound } from "lucide-react";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Security
            </CardTitle>
            <CardDescription>
              Keep your account secure and easy to recover.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Current password" type="password" />
            <Input placeholder="New password" type="password" />
            <Input placeholder="Confirm new password" type="password" />
            <Button variant="outline">Change password</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
            <CardDescription>
              Choose how you want updates delivered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-xl border p-3">
              Email alerts for new project requests
            </div>
            <div className="rounded-xl border p-3">
              Push reminders for deadlines and meetings
            </div>
            <div className="rounded-xl border p-3">
              Weekly summary of completed work
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
