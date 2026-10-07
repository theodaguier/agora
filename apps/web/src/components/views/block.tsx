import type { StatusTone } from "@agora/core";
import type { ComponentProps, ReactNode } from "react";
import { Card, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toneDot } from "./tone";

/**
 * Anatomy shared by every block a bot sends in the thread (choices, questions, approvals,
 * requests, views): one white card, a header whose title is the only strong element, one
 * grouped body, the actions in a row at the bottom right.
 */
export function BlockCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn("w-full max-w-[min(680px,88%)] gap-4 bg-background pt-4 shadow-xs [--card-spacing:--spacing(5)]", className)} {...props} />;
}

/** The actions: ghost secondary ones, then the primary one, on the right. */
export function BlockFooter({ className, ...props }: ComponentProps<typeof CardFooter>) {
  return <CardFooter className={cn("flex-wrap justify-end gap-2 border-t-0 bg-transparent pt-0 pb-4", className)} {...props} />;
}

/** A status under the header: a small dot in its tone, then the words, muted. */
export function StatusLine({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", toneDot[tone])} />
      {children}
    </p>
  );
}

/** The body's group: a bordered list whose rows are separated by a line. */
export function MetaList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("divide-y divide-border overflow-hidden rounded-[10px] border", className)} {...props} />;
}

/** One key/value row: the key muted, the value medium (mono for addresses, commands, identifiers). */
export function MetaRow({ label, mono, children }: { label: ReactNode; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-3.5 py-2.5">
      <dt className="w-24 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 flex-1", mono ? "font-mono text-xs break-all" : "text-sm font-medium")}>{children}</dd>
    </div>
  );
}
