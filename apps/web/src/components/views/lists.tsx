import { isPastDue, statusTone } from "@agora/core";
import type { ChatItem, CodeItem, ContactItem, EventItem, FileItem, FinanceItem, GenericItem, MailItem, MailMessageView, TableView, TaskItem } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useState, type ReactNode } from "react";
import { FILE_ICONS } from "@/lib/file-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { fileKind } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { cn, contentKeys } from "@/lib/utils";
import { dayKey, dayLabel, displayName, initials, money, shortDate, time } from "./format";
import { toneBadge } from "./tone";

const SHOWN = 8;

/** The first rows, then the rest on demand. */
/** An item's own id, or its content when the bot gave none. */
const itemKey = (item: { id?: string }) => item.id ?? JSON.stringify(item);

function Rows<T extends { id?: string }>({ items, children }: { items: T[]; children: (item: T, key: string) => ReactNode }) {
  const t = useT(integrations);
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="px-2.5 py-2 text-sm text-muted-foreground">{t.empty}</p>;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <ItemGroup className="gap-0">{contentKeys(shown, itemKey).map(([key, item]) => children(item, key))}</ItemGroup>
      {items.length > shown.length && (
        <Button variant="ghost" size="sm" className="mt-1 w-full font-normal text-muted-foreground" onClick={() => setAll(true)}>
          {t.more(items.length - shown.length)}
        </Button>
      )}
    </>
  );
}

/** One row: a link when the item has a web address, a button when the bot can open it. */
function Row({ url, onOpen, children }: { url?: string; onOpen?: () => void; children: ReactNode }) {
  const className = "rounded-xl px-2.5 py-2 text-left hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05]";
  if (url) return <Item size="sm" role="listitem" className={className} render={<a href={url} target="_blank" rel="noreferrer" />}>{children}</Item>;
  if (onOpen) return <Item size="sm" role="listitem" className={cn(className, "cursor-pointer")} render={<button type="button" onClick={onOpen} />}>{children}</Item>;
  return (
    <Item size="sm" role="listitem" className="rounded-xl px-2.5 py-2">
      {children}
    </Item>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <span className="shrink-0 self-start pt-0.5 text-xs tabular-nums text-muted-foreground">{children}</span>;

/** A status written by the bot, coloured by its tone (late, pending, done, ongoing…). */
const Status = ({ children }: { children?: string }) =>
  children ? (
    <Badge variant="secondary" className={cn("font-normal", toneBadge[statusTone(children)])}>
      {children}
    </Badge>
  ) : null;

export function MailList({ items, onAsk }: { items: MailItem[]; onAsk?: (item: MailItem) => void }) {
  const t = useT(integrations);
  return (
    <Rows items={items}>
      {(m, key) => (
        <Row key={key} url={m.url} onOpen={onAsk && (() => onAsk(m))}>
          <ItemMedia className="w-2 self-start pt-2">
            <span className={cn("size-2 rounded-full", m.unread ? "bg-brand" : "bg-transparent")} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className={cn("w-full truncate", m.unread ? "font-semibold" : "font-normal")}>{displayName(m.from)}</ItemTitle>
            <p className={cn("truncate text-sm", m.unread ? "text-foreground" : "text-foreground/85")}>{m.subject || t.noSubject}</p>
            {m.snippet && <ItemDescription className="line-clamp-1">{m.snippet}</ItemDescription>}
          </ItemContent>
          {m.date && <Meta>{shortDate(m.date)}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

export function MailMessage({ view }: { view: MailMessageView }) {
  const t = useT(integrations);
  const m = view.message;
  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-start gap-3">
        <Avatar className="size-9">
          <AvatarFallback className="bg-accent text-xs">{initials(displayName(m.from))}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[15px] font-medium">{displayName(m.from)}</p>
            {m.date && <Meta>{shortDate(m.date)}</Meta>}
          </div>
          {!!m.to?.length && (
            <p className="truncate text-xs text-muted-foreground">
              {t.to} {m.to.map(displayName).join(", ")}
            </p>
          )}
        </div>
      </div>
      <p className="text-[15px] font-medium">{m.subject || t.noSubject}</p>
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{m.body}</div>
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
  if (!items.length) return <p className="px-2.5 py-2 text-sm text-muted-foreground">{t.empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => {
        const events = items.filter((e) => dayKey(e.start) === day);
        return (
          <section key={day}>
            <h4 className="px-2.5 pb-0.5 pt-1 text-xs font-medium text-muted-foreground first-letter:uppercase">{dayLabel(events[0]!.start)}</h4>
            <ItemGroup className="gap-0">
              {contentKeys(events, itemKey).map(([key, e]) => (
                <Row key={key} url={e.url}>
                  <ItemMedia className="w-14 self-start pt-0.5 text-xs tabular-nums text-muted-foreground">
                    <span className="flex flex-col">
                      {e.allDay || !time(e.start) ? (
                        t.allDay
                      ) : (
                        <>
                          <span className="text-foreground">{time(e.start)}</span>
                          {time(e.end) && <span>{time(e.end)}</span>}
                        </>
                      )}
                    </span>
                  </ItemMedia>
                  <ItemContent className="min-w-0 gap-0.5 border-l-2 border-brand/60 pl-3">
                    <ItemTitle className="w-full truncate font-normal">{e.title}</ItemTitle>
                    {!!(e.location || e.attendees?.length) && (
                      <ItemDescription className="line-clamp-1">{[e.location, e.attendees?.map(displayName).join(", ")].filter(Boolean).join(" · ")}</ItemDescription>
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
          <ItemMedia className="self-start">
            <Avatar className="size-7">
              <AvatarFallback className="bg-accent text-[11px]">{initials(m.author)}</AvatarFallback>
            </Avatar>
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
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-xs">{initials(p.name)}</AvatarFallback>
            </Avatar>
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
  if (!view.rows.length) return <p className="px-2.5 py-2 text-sm text-muted-foreground">{t.empty}</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-xl bg-background/60">
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
