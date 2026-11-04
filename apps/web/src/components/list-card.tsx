import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { cn } from "@/lib/utils";

/**
 * A list in a card, shadcn parts only: the header over a hairline, then the rows
 * edge to edge, split by an ItemSeparator. For every list of the app (sessions, inbox, tasks, settings).
 */
export function ListCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn("gap-0 py-0", className)} {...props} />;
}

export function ListCardHeader({ className, ...props }: ComponentProps<typeof CardHeader>) {
  // Over rows: a hairline. Over a message (empty, loading, unreachable) or alone: a plain header.
  return <CardHeader className={cn("py-(--card-spacing) [&:has(+[data-list-rows])]:border-b [&:not(:last-child):not(:has(+[data-list-rows]))]:pb-0", className)} {...props} />;
}

export function ListCardRows({ children, className }: { children: ReactNode; className?: string }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <CardContent data-list-rows="" className="px-0">
      <ItemGroup
        className={cn(
          "gap-0 has-data-[size=sm]:gap-0 has-data-[size=xs]:gap-0 *:data-[slot=item]:rounded-none *:data-[slot=item]:px-(--card-spacing)",
          className,
        )}
      >
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 && <ItemSeparator className="my-0" />}
            {row}
          </Fragment>
        ))}
      </ItemGroup>
    </CardContent>
  );
}
