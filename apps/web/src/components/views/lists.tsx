import { isPastDue, statusTone } from "@agora/core";
import type { ChatItem, CodeItem, ContactItem, EventItem, FileItem, FinanceItem, GenericItem, MailItem, MailMessageView, TableView, TaskItem } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useState, type ReactNode } from "react";
import { FILE_ICONS } from "@/lib/file-icons";
import { FileTile, FileTiles } from "@/components/FileTile";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/BrandLogo";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { brandIcon } from "@/lib/brand-icons";
import { usersQuery } from "@/lib/queries";
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
      {/* Rows at the thread's size: 13 px titles, 12 px lines under them, edge to edge with the card's text. */}
      <ItemGroup role="list" className="-mx-2 w-auto gap-0 [&_[data-slot=item-description]]:text-xs [&_[data-slot=item-title]]:text-ui">
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
  if (url) return <Item size="xs" role="listitem" render={<a href={url} target="_blank" rel="noreferrer" />}>{children}</Item>;
  if (onOpen) return <Item size="xs" role="listitem" render={<button type="button" onClick={onOpen} className="text-left" />}>{children}</Item>;
  return (
    <Item size="xs" role="listitem">
      {children}
    </Item>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <span className="shrink-0 text-xs tabular-nums text-subtle-foreground">{children}</span>;

/** Gmail's letter colours: a sender without a photo gets one, always the same for the same name. */
const LETTER_COLORS = ["#1a73e8", "#e8710a", "#188038", "#d93025", "#9334e6", "#12b5cb", "#e52592", "#f29900"];
const hue = (name: string) => LETTER_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % LETTER_COLORS.length]!;
/** Mailboxes anyone has: their domain says nothing about who writes. */
const PERSONAL = /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|orange|free|sfr|laposte|wanadoo)\./i;

/**
 * Who wrote, as Gmail shows them: a colleague by their face, a company (Stripe…) by its logo, anyone
 * else by their first letter on a colour of their own. `from`: « Name <address> », a name or an address.
 */
function Sender({ from, size = "sm" }: { from: string; size?: "sm" | "lg" }) {
  const { data: people = [] } = useQuery(usersQuery);
  const name = displayName(from);
  const address = /<([^>]+)>/.exec(from)?.[1] ?? (from.includes("@") ? from.trim() : "");
  const domain = address.split("@")[1] ?? "";
  const box = size === "lg" ? "size-9" : "size-7";
  const colleague = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (colleague) return <PersonAvatar person={colleague} className={box} />;
  if (domain && !PERSONAL.test(domain) && brandIcon(domain)) {
    return (
      <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-accent", box)}>
        <BrandLogo domain={domain} fallback={null} className={size === "lg" ? "size-4.5" : "size-3.5"} />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full font-medium text-white", box, size === "lg" ? "text-ui" : "text-xs")} style={{ background: hue(name) }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Initials of a person (a contact, a chat author): the same face as a mail's sender. */
const Initials = ({ name, size }: { name: string; size?: "default" | "lg" }) => <Sender from={name} size={size === "lg" ? "lg" : "sm"} />;

/** A status written by the bot, as a badge with a dot in its tone (late, pending, done, ongoing…). */
const Status = ({ children }: { children?: string }) => (children ? <StatusLine tone={statusTone(children)}>{children}</StatusLine> : null);

export function MailList({ items, onAsk }: { items: MailItem[]; onAsk?: (item: MailItem) => void }) {
  const t = useT(integrations);
  return (
    <Rows items={items}>
      {(m, key) => (
        <Row key={key} url={m.url} onOpen={onAsk && (() => onAsk(m))}>
          <ItemMedia>
            <Sender from={m.from} />
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
        <Sender from={m.from} size="lg" />
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

/**
 * Where a found file downloads from: a Google Drive page has its own download address; any other
 * address is the file itself.
 */
function downloadUrl(url?: string) {
  if (!url) return undefined;
  const drive = /drive\.google\.com\/file\/d\/([^/?#]+)/.exec(url);
  return drive ? `https://drive.google.com/uc?export=download&id=${drive[1]}` : url;
}

/** The address itself when it is the file (an image, a PDF): the app can show it. A drive's page can't be. */
const viewable = (url?: string) => (url && /\.(png|jpe?g|gif|webp|avif|svg|pdf)(\?|#|$)/i.test(new URL(url, location.href).pathname) ? url : undefined);

/** Files a bot found (a drive, a folder): attachment tiles, as the files people send. */
export function FileList({ items, source }: { items: FileItem[]; source?: string }) {
  const t = useT(integrations);
  if (!items.length) return <NoItems>{t.empty}</NoItems>;
  return (
    <FileTiles>
      {items.map((f) => (
        <FileTile key={itemKey(f)} name={f.name} src={viewable(f.url)} openHref={f.url} source={source} downloadHref={downloadUrl(f.url)} meta={[f.size != null && formatSize(f.size), f.modified && shortDate(f.modified)].filter(Boolean).join(", ")} />
      ))}
    </FileTiles>
  );
}

/**
 * People (a CRM, an address book): their face, their name over their company, and on the right what
 * to do with them, write or call, as icons; never the address and the number run together.
 */
export function ContactList({ items }: { items: ContactItem[] }) {
  const t = useT(integrations);
  return (
    <Rows items={items}>
      {(p, key) => (
        <Row key={key} url={p.url}>
          <ItemMedia>
            <Initials name={p.name} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{p.name}</ItemTitle>
            {p.company && <ItemDescription className="line-clamp-1">{p.company}</ItemDescription>}
          </ItemContent>
          {(p.email || p.phone) && (
            <ItemActions className="gap-0.5">
              {p.email && (
                <Button variant="ghost" size="icon-sm" title={p.email} aria-label={`${t.write} ${p.email}`} nativeButton={false} render={<a href={`mailto:${p.email}`} />} className="text-muted-foreground">
                  <MailIcon />
                </Button>
              )}
              {p.phone && (
                <Button variant="ghost" size="icon-sm" title={p.phone} aria-label={`${t.call} ${p.phone}`} nativeButton={false} render={<a href={`tel:${p.phone.replace(/\s+/g, "")}`} />} className="text-muted-foreground">
                  <PhoneIcon />
                </Button>
              )}
            </ItemActions>
          )}
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
        // Without its address, a pull request's is known from its repository and number (GitHub's).
        <Row key={key} url={c.url ?? (c.repo && c.number != null ? `https://github.com/${c.repo}/pull/${c.number}` : undefined)}>
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">
              {c.number != null && <span className="tabular-nums text-muted-foreground">#{c.number} </span>}
              {c.title}
            </ItemTitle>
            {(c.repo || c.author) && <ItemDescription className="line-clamp-1">{[c.repo?.split("/").pop(), c.author].filter(Boolean).join(", ")}</ItemDescription>}
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

/**
 * Rows a bot read (a database, a sheet), as the tables written in a message: no box, the header in
 * small grey, hairlines between rows; a column of numbers right-aligned in code figures, header included.
 */
export function DataTable({ view }: { view: TableView }) {
  const t = useT(integrations);
  if (!view.rows.length) return <NoItems>{t.empty}</NoItems>;
  const numeric = view.columns.map((_, j) => view.rows.every((r) => r[j] == null || typeof r[j] === "number") && view.rows.some((r) => typeof r[j] === "number"));
  return (
    <div className="max-h-96 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {view.columns.map((c, j) => (
              <TableHead key={c} className={cn("h-auto px-0 pt-1 pb-2 text-xs font-normal text-muted-foreground not-first:pl-4", numeric[j] && "w-24 text-right")}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contentKeys(view.rows, (row) => JSON.stringify(row)).map(([key, row]) => (
            <TableRow key={key} className="hover:bg-transparent">
              {view.columns.map((_, j) => {
                const v = row[j];
                return (
                  <TableCell key={j} className={cn("max-w-64 truncate px-0 py-2.25 text-ui not-first:pl-4", numeric[j] && "text-right font-mono tabular-nums", v == null && "text-muted-foreground")}>
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
