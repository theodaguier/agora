import type { StatusTone } from "@agora/core";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toneDot } from "./tone";

/**
 * Anatomy shared by every block a bot sends in the thread (choices, questions, approvals,
 * requests, views): a shadcn Card › CardHeader (title, description, action) › CardContent › CardFooter.
 */
export function BlockCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn("w-full", className)} {...props} />;
}

/**
 * Figma « En-tête de bloc »: the icon of what the block is in a tile, its title and a muted line,
 * its state (or its close button) on the right; a hairline under it.
 */
export function BlockHeader({ icon, title, description, action, titleClassName }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; titleClassName?: string }) {
  return (
    <CardHeader className="border-b">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>}
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className={titleClassName}>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </div>
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  );
}

/** The actions: secondary ones, then the primary one, on the right. */
export function BlockFooter({ className, ...props }: ComponentProps<typeof CardFooter>) {
  return <CardFooter className={cn("flex-wrap justify-end gap-2", className)} {...props} />;
}

/** A status, as an outline badge with a dot in its tone (the colour carries the meaning). */
export function StatusLine({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      <span aria-hidden className={cn("size-1.5 rounded-full", toneDot[tone])} />
      {children}
    </Badge>
  );
}

/** Key/value rows, without a box. */
export function MetaList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("flex flex-col gap-2", className)} {...props} />;
}

/** One key/value row: the key muted, the value medium (mono for addresses, commands, identifiers). */
export function MetaRow({ label, mono, children }: { label: ReactNode; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 flex-1", mono ? "font-mono text-xs break-all" : "font-medium")}>{children}</dd>
    </div>
  );
}
