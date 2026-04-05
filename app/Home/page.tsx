import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart } from "recharts/types/chart/BarChart";
import { Bar } from "recharts/types/cartesian/Bar";
import App from "next/app";
import AppBarChart from "@/components/ui/AppBarChart";
import { TableFooterExample } from "@/components/tablesam";
export default function DashboardPage() {
  
  return (
    <div className="w-full  px-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 2xl:grid-cols-4 gap-4 mt-6 mb-6">
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Projects</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">25</CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Incoming Deadline</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">10</CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Number of Client</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">10</CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Finished Projects</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">24,203</CardContent>
          </Card>
        </div>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-2 gap-4 mt-6 mb-6">
          <div className="lg:col-span-3 xl:col-span-1">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-xl">Earnings</CardTitle>
              </CardHeader>
              <CardContent >
                <AppBarChart />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3 xl:col-span-1">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-xl">Top Paid Projects</CardTitle>
              </CardHeader>
              <CardContent >
                <TableFooterExample/>
              </CardContent>
            </Card>
          </div>

      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 2xl:grid-cols-4 gap-4 mt-6 mb-6">
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Projects</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">25</CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Incoming Deadline</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">10</CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Number of Client</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">10</CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-3 xl:col-span-1">
          <Card >
            <CardHeader>
              <CardTitle className="text-xl">Finished Projects</CardTitle>
            </CardHeader>
            <CardContent className="text-lg">24,203</CardContent>
          </Card>
        </div>

      </div>

    </div>
  )
}