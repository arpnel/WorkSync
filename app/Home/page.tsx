import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart } from "recharts/types/chart/BarChart";
import { Bar } from "recharts/types/cartesian/Bar";
import App from "next/app";
import { Calendar } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import AppBarChart from "@/components/ui/AppBarChart";
import { TableFooterExample } from "@/components/tablesam";
export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 w-full">

      {/* LEFT MAIN CONTENT */}
      <div className="space-y-6">

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card><CardContent>Projects: 25</CardContent></Card>
          <Card><CardContent>Deadlines: 10</CardContent></Card>
          <Card><CardContent>Clients: 10</CardContent></Card>
          <Card><CardContent>Finished: 24,203</CardContent></Card>
        </div>

        {/* CHART (FULL ROW / PROMINENT) */}
        <Card>
          <CardHeader>
            <CardTitle>Earnings Overview</CardTitle>
          </CardHeader>

          <CardContent>
            <AppBarChart />
          </CardContent>
        </Card>

        {/* TABLE (BELOW CHART FULL WIDTH) */}
        <Card>
          <CardHeader>
            <CardTitle>Top Paid Projects</CardTitle>
          </CardHeader>

          <CardContent>
            <TableFooterExample />
          </CardContent>
        </Card>

      </div>

      {/* RIGHT SIDEBAR (LONG + FIXED + NO WRAP) */}
       <div className="sticky top-6 h-[calc(100vh-3rem)] w-[340px] shrink-0 space-y-4">

      {/* 📅 CALENDAR CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Calendar</CardTitle>
        </CardHeader>

        <CardContent className="flex justify-center p-3">
          <div className="w-full max-w-[280px]">
            <Calendar
              mode="single"
              selected={new Date()}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* ⚡ QUICK ACTIONS CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Actions</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2">
          <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition">
            ➕ New Project
          </button>

          <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition">
            👥 Find Freelancers
          </button>

          <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition">
            💬 Messages
          </button>
        </CardContent>
      </Card>

      {/* 📝 ACTIVITY CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-sm">
          <p>🟢 Project “Logo Design” completed</p>
          <p>🟡 Client left feedback</p>
          <p>💰 Payment received</p>
          <p>👤 New freelancer joined</p>
        </CardContent>
      </Card>

    </div>
    </div>
  )
}