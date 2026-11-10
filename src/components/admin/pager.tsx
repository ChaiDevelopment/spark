import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Previous / next links for server-rendered admin lists (page is 1-based). */
export function Pager({ page, hasNext, href }: { page: number; hasNext: boolean; href: (page: number) => string }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={href(page - 1)}>← Newer</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-faint">Page {page}</span>
      {hasNext ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={href(page + 1)}>Older →</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
