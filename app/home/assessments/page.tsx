import { Suspense } from "react";
import FreelancerAssessments from "@/components/assessments/FreelancerAssessments";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading assessments…</p>}>
      <FreelancerAssessments />
    </Suspense>
  );
}
