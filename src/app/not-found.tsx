import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState, Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-glow grid min-h-dvh place-items-center px-5">
      <div className="text-center">
        <Logo className="mb-6" />
        <EmptyState
          icon={<Compass />}
          title="We couldn't find that"
          action={
            <Button asChild>
              <Link href="/">Go home</Link>
            </Button>
          }
        >
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </EmptyState>
      </div>
    </div>
  );
}
