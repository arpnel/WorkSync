import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="w-full px-6">
      <div className="lg:col-span-2 xl:col-span-1">
        <Card className="w-full">
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
            </CardHeader>
            <CardContent>Arpon</CardContent>
          </Card>

      </div>
    
    </div>
  )
}