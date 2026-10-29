import { StandardProjectWorkspace } from "@/components/standardproject/StandardProjectWorkspace";

export default async function StandardProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ orderId: serviceOrderId }, query] = await Promise.all([params, searchParams]);
  return <StandardProjectWorkspace
    serviceOrderId={serviceOrderId}
    initialAgreementView={query.view === "agreement"}
  />;
}
