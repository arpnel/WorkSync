export function FreelancerAvailability({ available }: { available?: boolean }) {
  const label = available === false ? "Fully booked" : available === true ? "Available for work" : "Availability unavailable";
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium" role="status">
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${available === false ? "bg-red-500" : available === true ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
    {label}
  </span>;
}
