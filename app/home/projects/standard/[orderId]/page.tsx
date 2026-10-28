import { StandardProjectWorkspace } from "@/components/standardproject/StandardProjectWorkspace";

export default async function StandardProjectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: serviceOrderId } = await params;
  return <StandardProjectWorkspace serviceOrderId={serviceOrderId} />;
}
