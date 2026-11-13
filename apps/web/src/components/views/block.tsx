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
  // Geist density: 12 px around and between the parts, as the session card in the thread.
  return <Card size="sm" className={cn("w-full", className)} {...props} />;
}

/**
 * A block's header on one line, as Linear's: what it is (its icon, its title), where it comes from in
 * grey beside it, its state or its count on the right; a hairline under it.
 */
export function BlockHeader({ icon, title, description, action, titleClassName }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; titleClassName?: string }) {
  return (
    <CardHeader className="border-b">
      <div className="flex min-w-0 items-center gap-2 text-ui">
        {icon && <span className="flex shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <CardTitle className={cn("min-w-0 text-ui font-medium", titleClassName)}>{title}</CardTitle>
        {description && <CardDescription className="min-w-0 shrink truncate text-xs text-subtle-foreground">{description}</CardDescription>}
      </div>
      {action && <CardAction className="self-center">{action}</CardAction>}
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
