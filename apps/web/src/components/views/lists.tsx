import { isPastDue, statusTone } from "@agora/core";
import type { ChatItem, CodeItem, ContactItem, EventItem, FileItem, FinanceItem, GenericItem, MailItem, MailMessageView, TableView, TaskItem } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useState, type ReactNode } from "react";
import { FILE_ICONS } from "@/lib/file-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { fileKind } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { cn, contentKeys } from "@/lib/utils";
import { dayKey, dayLabel, displayName, initials, money, shortDate, time } from "./format";
import { StatusLine } from "./block";

const SHOWN = 8;

/** An item's own id, or its content when the bot gave none. */
const itemKey = (item: { id?: string }) => item.id ?? JSON.stringify(item);

/** The first rows, then the rest on demand. */
function Rows<T extends { id?: string }>({ items, children }: { items: T[]; children: (item: T, key: string) => ReactNode }) {
  const t = useT(integrations);
  const [all, setAll] = useState(false);
  if (!items.length) return <NoItems>{t.empty}</NoItems>;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <ItemGroup role="list" className="gap-0">
        {contentKeys(shown, itemKey).map(([key, item]) => children(item, key))}
      </ItemGroup>
      {items.length > shown.length && (
        <Button variant="ghost" className="w-full" onClick={() => setAll(true)}>
          {t.more(items.length - shown.length)}
        </Button>
      )}
    </div>
  );
}

/** Nothing to list. */
const NoItems = ({ children }: { children: ReactNode }) => (
  <Empty>
    <EmptyHeader>
      <EmptyDescription>{children}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

/** One row: a link when the item has a web address, a button when the bot can open it. */
function Row({ url, onOpen, children }: { url?: string; onOpen?: () => void; children: ReactNode }) {
  if (url) return <Item size="sm" role="listitem" render={<a href={url} target="_blank" rel="noreferrer" />}>{children}</Item>;
  if (onOpen) return <Item size="sm" role="listitem" render={<button type="button" onClick={onOpen} />}>{children}</Item>;
  return (
    <Item size="sm" role="listitem">
      {children}
    </Item>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <span className="shrink-0 self-start text-xs tabular-nums text-muted-foreground">{children}</span>;

/** Initials of a person. */
const Initials = ({ name, size }: { name: string; size?: "default" | "lg" }) => (
  <Avatar size={size}>
    <AvatarFallback>{initials(name)}</AvatarFallback>
  </Avatar>
);

/** A status written by the bot, as a badge with a dot in its tone (late, pending, done, ongoing…). */
const Status = ({ children }: { children?: string }) => (children ? <StatusLine tone={statusTone(children)}>{children}</StatusLine> : null);

export function MailList({ items, onAsk }: { items: MailItem[]; onAsk?: (item: MailItem) => void }) {
  const t = useT(integrations);
  return (
    <Rows items={items}>
      {(m, key) => (
        <Row key={key} url={m.url} onOpen={onAsk && (() => onAsk(m))}>
          <ItemMedia>
            <Initials name={displayName(m.from)} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <div className="flex items-center gap-2">
              <ItemTitle className="min-w-0 flex-1 truncate">{displayName(m.from)}</ItemTitle>
              {m.unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />}
              {m.date && <Meta>{shortDate(m.date)}</Meta>}
            </div>
            <p className="truncate">{m.subject || t.noSubject}</p>
            {m.snippet && <ItemDescription className="line-clamp-1">{m.snippet}</ItemDescription>}
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
        <Initials name={displayName(m.from)} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-medium">{displayName(m.from)}</p>
            {m.date && <Meta>{shortDate(m.date)}</Meta>}
          </div>
          {!!m.to?.length && (
            <p className="truncate text-xs text-muted-foreground">
              {t.to} {m.to.map(displayName).join(", ")}
            </p>
          )}
        </div>
      </div>
      <p className="font-medium">{m.subject || t.noSubject}</p>
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap">{m.body}</div>
      {m.url && (
        <Button variant="link" className="self-start" nativeButton={false} render={<a href={m.url} target="_blank" rel="noreferrer" />}>
          {t.open}
        </Button>
      )}
    </div>
  );
}

export function EventList({ items }: { items: EventItem[] }) {
  const t = useT(integrations);
  const days = [...new Set(items.map((e) => dayKey(e.start)))];
  if (!items.length) return <NoItems>{t.empty}</NoItems>;
  // The event under way, or else the next one: its bar in the brand color.
  const now = Date.now();
  const current = items.find((e) => {
    const end = Date.parse(e.end ?? e.start);
    return !Number.isNaN(end) && end >= now;
  });
  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => {
        const events = items.filter((e) => dayKey(e.start) === day);
        return (
          <section key={day} className="flex flex-col gap-1">
            <h4 className="text-xs font-medium text-muted-foreground first-letter:uppercase">{dayLabel(events[0]!.start)}</h4>
            <ItemGroup className="gap-0">
              {contentKeys(events, itemKey).map(([key, e]) => (
                <Row key={key} url={e.url}>
                  <ItemMedia className="w-12">
                    <span className="flex flex-col text-xs tabular-nums">
                      {e.allDay || !time(e.start) ? (
                        <span className="text-muted-foreground">{t.allDay}</span>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{time(e.start)}</span>
                          {time(e.end) && <span className="text-muted-foreground">{time(e.end)}</span>}
                        </>
                      )}
                    </span>
                  </ItemMedia>
                  <span aria-hidden className={cn("w-1 shrink-0 self-stretch rounded-full", e === current ? "bg-brand" : "bg-border")} />
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{e.title}</ItemTitle>
                    {!!(e.location || e.attendees?.length) && (
                      <ItemDescription className="line-clamp-1">{[e.location, e.attendees?.map(displayName).join(", ")].filter(Boolean).join(", ")}</ItemDescription>
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">
              {m.author}
              {m.channel && <span className="font-normal text-muted-foreground"> {m.channel}</span>}
            </ItemTitle>
            <ItemDescription>{m.text}</ItemDescription>
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{task.title}</ItemTitle>
            {(task.assignee || task.due) && (
              <ItemDescription className="line-clamp-1">
                {task.assignee}
                {task.assignee && task.due && ", "}
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
            <ItemMedia variant="icon">
              <Icon />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate">{f.name}</ItemTitle>
            </ItemContent>
            <Meta>{[f.size != null && formatSize(f.size), f.modified && shortDate(f.modified)].filter(Boolean).join(", ")}</Meta>
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">
              {p.name}
              {p.company && <span className="font-normal text-muted-foreground"> {p.company}</span>}
            </ItemTitle>
            {(p.email || p.phone) && <ItemDescription className="line-clamp-1">{[p.email, p.phone].filter(Boolean).join(", ")}</ItemDescription>}
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{f.label}</ItemTitle>
            {(f.counterparty || f.date) && (
              <ItemDescription className="line-clamp-1">{[f.counterparty, f.date && shortDate(f.date)].filter(Boolean).join(", ")}</ItemDescription>
            )}
          </ItemContent>
          <ItemActions className="flex-col items-end gap-1">
            <span className={cn("font-medium tabular-nums", statusTone(f.status) === "danger" && "text-destructive")}>{money(f.amount, f.currency)}</span>
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">
              {c.number != null && <span className="tabular-nums text-muted-foreground">#{c.number} </span>}
              {c.title}
            </ItemTitle>
            {(c.repo || c.author) && <ItemDescription className="line-clamp-1 font-mono text-xs">{[c.repo, c.author].filter(Boolean).join(", ")}</ItemDescription>}
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
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{g.title}</ItemTitle>
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
  if (!view.rows.length) return <NoItems>{t.empty}</NoItems>;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {view.columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
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
