import { isPastDue, statusTone } from "@agora/core";
import type { ChatItem, CodeItem, ContactItem, EventItem, FileItem, FinanceItem, GenericItem, MailItem, MailMessageView, TableView, TaskItem } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useState, type ReactNode } from "react";
import { FILE_ICONS } from "@/lib/file-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { fileKind } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { cn, contentKeys } from "@/lib/utils";
import { dayKey, dayLabel, displayName, initials, money, shortDate, time } from "./format";
import { toneDot } from "./tone";

const SHOWN = 8;

/** The first rows, then the rest on demand. */
/** An item's own id, or its content when the bot gave none. */
const itemKey = (item: { id?: string }) => item.id ?? JSON.stringify(item);

function Rows<T extends { id?: string }>({ items, children }: { items: T[]; children: (item: T, key: string) => ReactNode }) {
  const t = useT(integrations);
  const [all, setAll] = useState(false);
  if (!items.length) return <Empty>{t.empty}</Empty>;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <ItemGroup className="gap-0 px-2">{contentKeys(shown, itemKey).map(([key, item]) => children(item, key))}</ItemGroup>
      {items.length > shown.length && (
        <CardFooter className="mt-1 bg-transparent p-0">
          <Button variant="ghost" className="h-11 w-full justify-between rounded-none rounded-b-2xl px-5 font-normal" onClick={() => setAll(true)}>
            {t.more(items.length - shown.length)}
          </Button>
        </CardFooter>
      )}
    </>
  );
}

/** Nothing to list. */
const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-1 text-sm text-muted-foreground">{children}</p>;

/** One row: a link when the item has a web address, a button when the bot can open it. */
function Row({ url, onOpen, className, children }: { url?: string; onOpen?: () => void; className?: string; children: ReactNode }) {
  const base = cn("items-start gap-3 rounded-[10px] px-3 py-2.5 text-left", className);
  const active = cn(base, "hover:bg-muted focus-visible:bg-muted");
  if (url) return <Item size="sm" role="listitem" className={active} render={<a href={url} target="_blank" rel="noreferrer" />}>{children}</Item>;
  if (onOpen) return <Item size="sm" role="listitem" className={cn(active, "cursor-pointer")} render={<button type="button" onClick={onOpen} />}>{children}</Item>;
  return (
    <Item size="sm" role="listitem" className={base}>
      {children}
    </Item>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <span className="shrink-0 self-start pt-0.5 text-xs tabular-nums text-subtle">{children}</span>;

/** Initials of a person, on a gray disc. */
const Initials = ({ name, className }: { name: string; className?: string }) => (
  <Avatar className={cn("size-8", className)}>
    <AvatarFallback className="bg-secondary text-[11px] font-medium text-muted-foreground">{initials(name)}</AvatarFallback>
  </Avatar>
);

/** A status written by the bot: a dot in its tone (late, pending, done, ongoing…), the words muted. */
const Status = ({ children }: { children?: string }) =>
  children ? (
    <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-muted-foreground">
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", toneDot[statusTone(children)])} />
      {children}
    </span>
  ) : null;

export function MailList({ items, onAsk }: { items: MailItem[]; onAsk?: (item: MailItem) => void }) {
  const t = useT(integrations);
  return (
    <Rows items={items}>
      {(m, key) => (
        <Row key={key} url={m.url} onOpen={onAsk && (() => onAsk(m))}>
          <ItemMedia>
            <Initials name={displayName(m.from)} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0">
            <div className="flex items-center gap-2">
              <ItemTitle className={cn("min-w-0 flex-1 truncate", m.unread ? "font-semibold" : "font-medium")}>{displayName(m.from)}</ItemTitle>
              {m.unread && <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-brand" />}
              {m.date && <span className="shrink-0 text-xs tabular-nums text-subtle">{shortDate(m.date)}</span>}
            </div>
            <p className="truncate text-sm">{m.subject || t.noSubject}</p>
            {m.snippet && <ItemDescription className="line-clamp-1 text-[13px]">{m.snippet}</ItemDescription>}
          </ItemContent>
        </Row>
      )}
    </Rows>
  );
}

export function MailMessage({ view }: { view: MailMessageView }) {
  const t = useT(integrations);
  const m = view.message;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Initials name={displayName(m.from)} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">{displayName(m.from)}</p>
            {m.date && <Meta>{shortDate(m.date)}</Meta>}
          </div>
          {!!m.to?.length && (
            <p className="truncate text-xs text-muted-foreground">
              {t.to} {m.to.map(displayName).join(", ")}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm font-medium">{m.subject || t.noSubject}</p>
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{m.body}</div>
      {m.url && (
        <a href={m.url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t.open}
        </a>
      )}
    </div>
  );
}

export function EventList({ items }: { items: EventItem[] }) {
  const t = useT(integrations);
  const days = [...new Set(items.map((e) => dayKey(e.start)))];
  if (!items.length) return <Empty>{t.empty}</Empty>;
  // The event under way, or else the next one: its bar in the brand color.
  const now = Date.now();
  const current = items.find((e) => {
    const end = Date.parse(e.end ?? e.start);
    return !Number.isNaN(end) && end >= now;
  });
  return (
    <div className="flex flex-col gap-2 px-2">
      {days.map((day) => {
        const events = items.filter((e) => dayKey(e.start) === day);
        return (
          <section key={day}>
            <h4 className="px-3 pb-0.5 pt-1 text-xs font-medium text-muted-foreground first-letter:uppercase">{dayLabel(events[0]!.start)}</h4>
            <ItemGroup className="gap-0">
              {contentKeys(events, itemKey).map(([key, e]) => (
                <Row key={key} url={e.url} className="items-stretch rounded-none border-0 border-border not-last:border-b">
                  <ItemMedia className="w-12 items-start text-[13px] tabular-nums">
                    <span className="flex flex-col">
                      {e.allDay || !time(e.start) ? (
                        <span className="text-muted-foreground">{t.allDay}</span>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{time(e.start)}</span>
                          {time(e.end) && <span className="text-subtle">{time(e.end)}</span>}
                        </>
                      )}
                    </span>
                  </ItemMedia>
                  <span aria-hidden className={cn("w-[3px] shrink-0 rounded-full", e === current ? "bg-brand" : "bg-border")} />
                  <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle className="w-full truncate">{e.title}</ItemTitle>
                    {!!(e.location || e.attendees?.length) && (
                      <ItemDescription className="line-clamp-1 text-[13px]">{[e.location, e.attendees?.map(displayName).join(", ")].filter(Boolean).join(" · ")}</ItemDescription>
                    )}
                  </ItemContent>
                </Row>
              ))}
            </ItemGroup>
          </section>
        );
      })}
    </div>
  );
}

export function ChatList({ items }: { items: ChatItem[] }) {
  return (
    <Rows items={items}>
      {(m, key) => (
        <Row key={key} url={m.url}>
          <ItemMedia>
            <Initials name={m.author} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate">
              {m.author}
              {m.channel && <span className="font-normal text-muted-foreground"> · {m.channel}</span>}
            </ItemTitle>
            <p className="line-clamp-2 text-sm text-foreground/90">{m.text}</p>
          </ItemContent>
          {m.date && <Meta>{shortDate(m.date)}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

export function TaskItems({ items }: { items: TaskItem[] }) {
  return (
    <Rows items={items}>
      {(task, key) => (
        <Row key={key} url={task.url}>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate font-normal">{task.title}</ItemTitle>
            {(task.assignee || task.due) && (
              <ItemDescription className="line-clamp-1">
                {task.assignee}
                {task.assignee && task.due && " · "}
                {task.due && (
                  <span className={cn(isPastDue(task.due) && statusTone(task.status) !== "success" && "font-medium text-destructive")}>{shortDate(task.due)}</span>
                )}
              </ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            <Status>{task.status}</Status>
          </ItemActions>
        </Row>
      )}
    </Rows>
  );
}

export function FileList({ items }: { items: FileItem[] }) {
  return (
    <Rows items={items}>
      {(f, key) => {
        const Icon = FILE_ICONS[fileKind(f.name)];
        return (
          <Row key={key} url={f.url}>
            <ItemMedia variant="icon" className="text-muted-foreground">
              <Icon />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate font-normal">{f.name}</ItemTitle>
            </ItemContent>
            <Meta>{[f.size != null && formatSize(f.size), f.modified && shortDate(f.modified)].filter(Boolean).join(" · ")}</Meta>
          </Row>
        );
      }}
    </Rows>
  );
}

export function ContactList({ items }: { items: ContactItem[] }) {
  return (
    <Rows items={items}>
      {(p, key) => (
        <Row key={key} url={p.url ?? (p.email ? `mailto:${p.email}` : undefined)}>
          <ItemMedia>
            <Initials name={p.name} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate">
              {p.name}
              {p.company && <span className="font-normal text-muted-foreground"> · {p.company}</span>}
            </ItemTitle>
            {(p.email || p.phone) && <ItemDescription className="line-clamp-1">{[p.email, p.phone].filter(Boolean).join(" · ")}</ItemDescription>}
          </ItemContent>
        </Row>
      )}
    </Rows>
  );
}

export function FinanceList({ items }: { items: FinanceItem[] }) {
  return (
    <Rows items={items}>
      {(f, key) => (
        <Row key={key} url={f.url}>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate font-normal">{f.label}</ItemTitle>
            {(f.counterparty || f.date) && (
              <ItemDescription className="line-clamp-1">{[f.counterparty, f.date && shortDate(f.date)].filter(Boolean).join(" · ")}</ItemDescription>
            )}
          </ItemContent>
          <ItemActions className="flex-col items-end gap-1">
            <span className={cn("text-sm font-medium tabular-nums", statusTone(f.status) === "danger" && "text-destructive")}>{money(f.amount, f.currency)}</span>
            <Status>{f.status}</Status>
          </ItemActions>
        </Row>
      )}
    </Rows>
  );
}

export function CodeList({ items }: { items: CodeItem[] }) {
  return (
    <Rows items={items}>
      {(c, key) => (
        <Row key={key} url={c.url}>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate font-normal">
              {c.number != null && <span className="tabular-nums text-muted-foreground">#{c.number} </span>}
              {c.title}
            </ItemTitle>
            {(c.repo || c.author) && <ItemDescription className="line-clamp-1 font-mono text-xs">{[c.repo, c.author].filter(Boolean).join(" · ")}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            <Status>{c.state}</Status>
          </ItemActions>
        </Row>
      )}
    </Rows>
  );
}

export function GenericList({ items }: { items: GenericItem[] }) {
  return (
    <Rows items={items}>
      {(g, key) => (
        <Row key={key} url={g.url}>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate font-normal">{g.title}</ItemTitle>
            {g.subtitle && <ItemDescription className="line-clamp-1">{g.subtitle}</ItemDescription>}
          </ItemContent>
          {g.meta && <Meta>{g.meta}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

export function DataTable({ view }: { view: TableView }) {
  const t = useT(integrations);
  if (!view.rows.length) return <p className="text-sm text-muted-foreground">{t.empty}</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-[10px] border">
      <Table>
        <TableHeader>
          <TableRow>
            {view.columns.map((c) => (
              <TableHead key={c} className="text-xs">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contentKeys(view.rows, (row) => JSON.stringify(row)).map(([key, row]) => (
            <TableRow key={key}>
              {view.columns.map((_, j) => {
                const v = row[j];
                return (
                  <TableCell key={j} className={cn("max-w-64 truncate", typeof v === "number" && "text-right tabular-nums", v == null && "text-muted-foreground")}>
                    {v == null ? "—" : String(v)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
