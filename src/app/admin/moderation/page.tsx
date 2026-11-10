import { redirect } from "next/navigation";

/** The queues moved to /admin/photos and /admin/reports. Old links keep working. */
export default function ModerationRedirect() {
  redirect("/admin/reports");
}
