import { MilestoneProjectWorkspace } from "@/components/milestoneproject/MilestoneProjectWorkspace";

export default async function MilestoneProjectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: serviceOrderId } = await params;
  return <MilestoneProjectWorkspace serviceOrderId={serviceOrderId} />;
}
