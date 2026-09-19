import Link from "next/link";
import { PaymentPanel } from "@/components/project/ProjectPaymentPanel";
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const projectId =
    typeof payment === "string" &&
    /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(payment)
      ? payment
      : null;
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Payment status</h1>
      <p className="text-sm text-muted-foreground">
        We check PayMongo before confirming payment. Returning from checkout
        does not by itself mean payment succeeded.
      </p>
      {projectId ? (
        <PaymentPanel projectId={projectId} />
      ) : (
        <p>Open your project to check its payment.</p>
      )}
      <Link className="text-sm underline" href="/home/projects">
        Back to projects
      </Link>
    </div>
  );
}
