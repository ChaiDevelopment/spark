import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { requireViewer } from "@/server/auth";
import { loadOwnProfile } from "@/server/profile-data";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const viewer = await requireViewer();
  const data = await loadOwnProfile(viewer.userId);
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/me" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> My profile
      </Link>
      <h1 className="mb-6 font-display text-3xl font-extrabold">Edit profile</h1>
      <EditProfileForm {...data} />
    </div>
  );
}
