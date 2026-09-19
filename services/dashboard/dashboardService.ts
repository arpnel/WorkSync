import { getProjects } from "@/services/project/projectService";
import { getMyMarketplaceListings } from "@/services/marketplace/MarketplaceServices";
import { getNotifications } from "@/services/notification/notificationService";
const record = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
};
export async function getDashboardActivity() {
  const [projects, listings, notifications] = await Promise.all([
    getDashboardProjects(),
    getMyMarketplaceListings(),
    getNotifications(),
  ]);
  return { projects, listings, notifications };
}
export async function getDashboardProjects() {
  const orders = await getProjects();
  return orders
    .filter(
      (order) =>
        record(order.client_profile).user_id === order.current_user_id ||
        record(order.freelancer_profile).user_id === order.current_user_id,
    )
    .map((order) => {
      const project = record(order.project),
        contract = record(order.contract),
        service = record(order.service);
      const status = String(project.status ?? order.status).toLowerCase();
      return {
        id: order.order_id,
        projectId: project.project_id ? String(project.project_id) : null,
        party:
          record(order.freelancer_profile).user_id === order.current_user_id
            ? ("freelancer" as const)
            : ("client" as const),
        startedAt: project.start_date ? String(project.start_date) : null,
        completedAt: project.completed_at ? String(project.completed_at) : null,
        title: String(project.title ?? service.title ?? "Service request"),
        status,
        agreedBudget:
          contract.final_price != null ? Number(contract.final_price) : null,
        budget: Number(
          contract.final_price ?? project.budget ?? service.price ?? 0,
        ),
        dueDate: project.due_date ? String(project.due_date) : null,
        createdAt: order.created_at,
        type: service.service_type === "milestone" ? "milestone" : "standard",
      };
    });
}
export type DashboardActivity = Awaited<
  ReturnType<typeof getDashboardActivity>
>;
