import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getStaffRole, requireViewer } from "@/server/auth";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ count }, role] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    getStaffRole(),
    supabase.rpc("touch_last_active"),
  ]);

  return (
    <AppShell userId={viewer.userId} displayName={viewer.profile.display_name} unread={count ?? 0} staff={Boolean(role)}>
      {children}
    </AppShell>
  );
}
