import { ProjectContractDialog } from "./ProjectContractDialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

export function ContractSummary({ project }: { project: ProjectWorkspace }) {
  return (
    <section className="flex justify-end">
      <div className="w-full sm:w-auto">
        <ProjectContractDialog project={project} />
      </div>
    </section>
  );
}
