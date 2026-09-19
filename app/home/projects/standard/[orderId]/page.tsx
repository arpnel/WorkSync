import { StandardProjectWorkspace } from "@/components/standardproject/StandardProjectWorkspace";

export default async function StandardProjectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <StandardProjectWorkspace orderId={orderId} />;
}
