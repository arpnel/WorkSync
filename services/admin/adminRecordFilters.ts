import type { AdminRow } from "./adminService";
export function filterAdminPage(
  rows: AdminRow[],
  status: string,
  from: string,
  to: string,
  sort: string,
) {
  return rows
    .filter((row) => {
      const parsed = row.created_at ? new Date(row.created_at) : null;
      const date =
        parsed && Number.isFinite(parsed.getTime())
          ? [
              parsed.getFullYear(),
              String(parsed.getMonth() + 1).padStart(2, "0"),
              String(parsed.getDate()).padStart(2, "0"),
            ].join("-")
          : "";
      return (
        (status === "all" || row.status === status) &&
        (!from || (!!date && date >= from)) &&
        (!to || (!!date && date <= to))
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)
          : (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
    );
}
