type ProjectFlowDiagnostic = Record<string, unknown>;

/** Temporary browser diagnostics for accepted job applications opening projects. */
export function traceProjectFlow(
  stage: string,
  details: ProjectFlowDiagnostic,
) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[project-flow] ${stage}`, details);
  }
}
