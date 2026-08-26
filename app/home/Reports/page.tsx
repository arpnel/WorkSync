import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";

const summaryCards = [
  { title: "Warnings", value: "4", description: "Need follow-up", icon: AlertTriangle, tone: "text-amber-600" },
  { title: "Incoming", value: "12", description: "New requests", icon: ArrowUpRight, tone: "text-blue-600" },
  { title: "Ongoing", value: "7", description: "In progress", icon: Clock3, tone: "text-violet-600" },
  { title: "Completed", value: "18", description: "Delivered this month", icon: CheckCircle2, tone: "text-emerald-600" },
];

const reportRows = [
  { client: "Northstar Studio", project: "Website Redesign", amount: "$2,400", status: "In Review" },
  { client: "Lumen Labs", project: "Brand Kit", amount: "$1,150", status: "On Track" },
  { client: "BrightLoop", project: "Landing Page Copy", amount: "$780", status: "Delivered" },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{card.value}</div>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent reports</CardTitle>
          <CardDescription>Track your latest freelance activity and payment progress.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportRows.map((row) => (
                <TableRow key={row.project}>
                  <TableCell>{row.client}</TableCell>
                  <TableCell>{row.project}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
