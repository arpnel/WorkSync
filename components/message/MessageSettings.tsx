import { MessageCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export default function MessageSettings() {
  return (
    <Card id="messages" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Message settings
        </CardTitle>
        <CardDescription>Manage your messaging preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No messaging preferences are available yet.
        </p>
      </CardContent>
    </Card>
  );
}
