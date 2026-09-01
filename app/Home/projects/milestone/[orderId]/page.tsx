import { MilestoneProjectWorkspace } from "@/components/milestoneproject/MilestoneProjectWorkspace";

export default async function MilestoneProjectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <MilestoneProjectWorkspace orderId={orderId} />;
}
