import { LanguageSwitch } from "@/components/language-switch";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Image as ImageIcon,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { requireStaff } from "@/server/auth";

export const metadata = {
  title: { default: "Admin", template: "%s · SPARK Admin" },
  robots: { index: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { role, profile } = await requireStaff();
  const nav = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/photos", label: "Photos", icon: ImageIcon },
    { href: "/admin/reports", label: "Reports", icon: ShieldCheck },
    { href: "/admin/users", label: "Users", icon: Users },
    ...(role === "admin"
      ? [{ href: "/admin/audit", label: "Audit log", icon: ClipboardList }]
      : []),
  ];
  return (
    <div className="min-h-dvh bg-[#faf7f6]">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo href="/admin" />
          <span className="rounded-full bg-lavender/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-lavender-deep">
            {role}
          </span>
          <nav className="flex gap-1" aria-label="Admin">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-cream hover:text-ink"
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSwitch />
            <Link
              href="/discover"
              className="inline-flex items-center gap-1 text-sm font-semibold text-ink-faint hover:text-ink"
            >
              <ArrowLeft className="size-4" /> Back to app (
              {profile.display_name})
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
