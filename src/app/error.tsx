"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-5">
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        action={
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        }
      >
        We hit an unexpected problem. Your data is safe.{error.digest ? ` (ref: ${error.digest})` : ""}
      </EmptyState>
    </div>
  );
}
