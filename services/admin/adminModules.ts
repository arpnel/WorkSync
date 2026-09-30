/** UI identifiers and read dispatch. Records identifiers match the checked-in SQL;
 * deployed aliases must be established from pg_get_functiondef, never guessed. */
export const ADMIN_MODULES = {
  overview: "overview",
  users: "users",
  jobs: "jobs",
  services: "services",
  projects: "projects",
  reports: "reports",
  verification: "verification",
  audit: "audit",
  transactions: "transactions",
  disputes: "disputes",
} as const;
export type AdminModule = keyof typeof ADMIN_MODULES;
export const ADMIN_RECORD_MODULES = {
  [ADMIN_MODULES.overview]: "overview",
  [ADMIN_MODULES.users]: "users",
  [ADMIN_MODULES.jobs]: "jobs",
  [ADMIN_MODULES.services]: "services",
  [ADMIN_MODULES.projects]: "projects",
  [ADMIN_MODULES.reports]: "reports",
  [ADMIN_MODULES.verification]: "verification",
  [ADMIN_MODULES.audit]: "audit",
  [ADMIN_MODULES.transactions]: "transactions",
} as const;
