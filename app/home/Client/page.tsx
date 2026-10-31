import { redirect } from "next/navigation";

export default function ClientsRedirectPage() {
  redirect("/home/analytics");
}
