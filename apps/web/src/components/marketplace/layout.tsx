import type { ReactNode } from "react";
import { ItemGroup } from "@/components/ui/item";

/** A section of the marketplace: its title (and what to do with it) on one line, then its content. No box: the dialog is the box. */
export function MarketSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Entries in a grid (two, three on a wide dialog), each an outlined Item. */
export function Tiles({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <ItemGroup aria-busy={busy || undefined} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </ItemGroup>
  );
}

/** The top of an add sheet: the tile, the name and its kind on one line, what it is under them. */
export function SheetHeader({ media, title, description, badge }: { media: ReactNode; title: string; description?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="flex items-center gap-3">
      {media}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-medium">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}
