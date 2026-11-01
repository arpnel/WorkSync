import { invalidateProjectReadCache } from "@/lib/projectReadCache";

const PROJECT_ACTIVITY_CHANGED = "worksync:project-activity-changed";

export function notifyProjectActivityChanged(projectId: string) {
  invalidateProjectReadCache(`delivery:${projectId}`);
  window.dispatchEvent(
    new CustomEvent(PROJECT_ACTIVITY_CHANGED, { detail: { projectId } }),
  );
}

export function subscribeToProjectActivityChanges(
  projectId: string,
  onChange: () => void,
) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ projectId?: unknown }>).detail;
    if (detail?.projectId === projectId) onChange();
  };
  window.addEventListener(PROJECT_ACTIVITY_CHANGED, listener);
  return () => window.removeEventListener(PROJECT_ACTIVITY_CHANGED, listener);
}
