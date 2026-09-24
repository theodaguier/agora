import { isPastDue, statusTone } from "@agora/core";
import type { ChatItem, CodeItem, ContactItem, EventItem, FileItem, FinanceItem, GenericItem, MailItem, MailMessageView, TableView, TaskItem } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar, Button, Chip, LinkButton, ListGroup, ScrollShadow, Separator, Surface, Typography } from "heroui-native";
import { Fragment, useState, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";
import { FILE_ICONS } from "@/components/text-style";
import { fileKind } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toneChip } from "./tone";
import { dayKey, dayLabel, displayName, initials, money, shortDate, time } from "./format";

/* apps/web/src/components/views/lists.tsx */

const SHOWN = 8;

function Empty() {
  return (
    <Typography.Paragraph type="body-sm" color="muted" className="py-2">
      {tr(integrations).empty}
    </Typography.Paragraph>
  );
}

/** Rows of a list, separated by hairlines like an iOS table. */
function Group<T>({ items, children }: { items: T[]; children: (item: T, i: number) => ReactNode }) {
  return (
    <ListGroup variant="transparent">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator />}
          {children(item, i)}
        </Fragment>
      ))}
    </ListGroup>
  );
}

/** The first rows, then the rest on demand. */
function Rows<T>({ items, children }: { items: T[]; children: (item: T, i: number) => ReactNode }) {
  const t = tr(integrations);
  const [all, setAll] = useState(false);
  if (!items.length) return <Empty />;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <Group items={shown}>{children}</Group>
      {items.length > shown.length && (
        <Button variant="ghost" size="sm" className="mt-1" onPress={withTap(() => setAll(true))}>
          {t.more(items.length - shown.length)}
        </Button>
      )}
    </>
  );
}

/** One row: opens the item's web address, or asks the bot to open it. */
function Row({ url, onOpen, className, children }: { url?: string; onOpen?: () => void; className?: string; children: ReactNode }) {
  const press = url ? () => Linking.openURL(url) : onOpen;
  return (
    <ListGroup.Item onPress={withTap(press)} disabled={!press} accessibilityRole={press ? "link" : undefined} className={cn("items-start gap-3 px-0 py-2.5", className)}>
      {children}
    </ListGroup.Item>
  );
}

const Meta = ({ children }: { children: ReactNode }) => (
  <Typography.Paragraph type="body-xs" color="muted" className="shrink-0 pt-0.5 tabular-nums">
    {children}
  </Typography.Paragraph>
);

const Status = ({ children }: { children?: string }) => {
  if (!children) return null;
  return (
    <Chip size="sm" variant="soft" color={toneChip[statusTone(children)]}>
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
};

/** Initials of a person, on a neutral fill. */
function Initials({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return (
    <Avatar alt={name} size={size} variant="soft" color="default">
      <Avatar.Fallback>{initials(name)}</Avatar.Fallback>
    </Avatar>
  );
}

export function MailList({ items, onAsk }: { items: MailItem[]; onAsk?: (item: MailItem) => void }) {
  const t = tr(integrations);
  return (
    <Rows items={items}>
      {(m, i) => (
        <Row key={m.id ?? i} url={m.url} onOpen={onAsk && (() => onAsk(m))}>
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle numberOfLines={1}>
              {displayName(m.from)}
            </ListGroup.ItemTitle>
            <Typography.Paragraph type="body-sm" weight={m.unread ? "medium" : "normal"} numberOfLines={1}>
              {m.subject || t.noSubject}
            </Typography.Paragraph>
            {!!m.snippet && <ListGroup.ItemDescription numberOfLines={1}>{m.snippet}</ListGroup.ItemDescription>}
          </ListGroup.ItemContent>
          {!!m.date && <Meta>{shortDate(m.date)}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

export function MailMessage({ view }: { view: MailMessageView }) {
  const t = tr(integrations);
  const m = view.message;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Initials name={displayName(m.from)} size="md" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline justify-between gap-3">
            <Typography.Heading type="h6" numberOfLines={1} className="shrink">
              {displayName(m.from)}
            </Typography.Heading>
            {!!m.date && <Meta>{shortDate(m.date)}</Meta>}
          </View>
          {!!m.to?.length && (
            <Typography.Paragraph type="body-sm" color="muted" numberOfLines={1}>
              {t.to} {m.to.map(displayName).join(", ")}
            </Typography.Paragraph>
          )}
        </View>
      </View>
      <Typography.Heading type="h6">{m.subject || t.noSubject}</Typography.Heading>
      <ScrollShadow LinearGradientComponent={LinearGradient} className="max-h-80">
        <ScrollView nestedScrollEnabled>
          <Typography.Paragraph selectable>{m.body}</Typography.Paragraph>
        </ScrollView>
      </ScrollShadow>
      {!!m.url && (
        <LinkButton size="sm" accessibilityRole="link" onPress={withTap(() => Linking.openURL(m.url!))} className="self-start">
          {t.open}
        </LinkButton>
      )}
    </View>
  );
}

export function EventList({ items }: { items: EventItem[] }) {
  const t = tr(integrations);
  const days = [...new Set(items.map((e) => dayKey(e.start)))];
  if (!items.length) return <Empty />;
  return (
    <View className="gap-3">
      {days.map((day) => {
        const events = items.filter((e) => dayKey(e.start) === day);
        const label = dayLabel(events[0]!.start);
        return (
          <View key={day}>
            <Typography.Paragraph type="body-xs" color="muted" weight="semibold" className="pt-1">
              {label.charAt(0).toUpperCase() + label.slice(1)}
            </Typography.Paragraph>
            <Group items={events}>
              {(e, i) => (
                <Row key={e.id ?? i} url={e.url} className="items-stretch">
                  <View className="w-14 pt-0.5">
                    {e.allDay || !time(e.start) ? (
                      <Typography.Paragraph type="body-xs" color="muted">
                        {t.allDay}
                      </Typography.Paragraph>
                    ) : (
                      <>
                        <Typography.Paragraph type="body-sm" className="tabular-nums">
                          {time(e.start)}
                        </Typography.Paragraph>
                        {!!time(e.end) && (
                          <Typography.Paragraph type="body-xs" color="muted" className="tabular-nums">
                            {time(e.end)}
                          </Typography.Paragraph>
                        )}
                      </>
                    )}
                  </View>
                  <Separator orientation="vertical" thickness={2} />
                  <ListGroup.ItemContent className="min-w-0 gap-0.5">
                    <ListGroup.ItemTitle>{e.title}</ListGroup.ItemTitle>
                    {!!(e.location || e.attendees?.length) && (
                      <ListGroup.ItemDescription numberOfLines={1}>
                        {[e.location, e.attendees?.map(displayName).join(", ")].filter(Boolean).join(" · ")}
                      </ListGroup.ItemDescription>
                    )}
                  </ListGroup.ItemContent>
                </Row>
              )}
            </Group>
          </View>
        );
      })}
    </View>
  );
}

export function ChatList({ items }: { items: ChatItem[] }) {
  return (
    <Rows items={items}>
      {(m, i) => (
        <Row key={m.id ?? i} url={m.url}>
          <Initials name={m.author} />
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle numberOfLines={1}>
              {m.author}
              {!!m.channel && (
                <Typography color="muted" weight="normal">
                  {" "}
                  · {m.channel}
                </Typography>
              )}
            </ListGroup.ItemTitle>
            <Typography.Paragraph type="body-sm" numberOfLines={2}>
              {m.text}
            </Typography.Paragraph>
          </ListGroup.ItemContent>
          {!!m.date && <Meta>{shortDate(m.date)}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

export function TaskItems({ items }: { items: TaskItem[] }) {
  return (
    <Rows items={items}>
      {(task, i) => (
        <Row key={task.id ?? i} url={task.url}>
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle>{task.title}</ListGroup.ItemTitle>
            {!!(task.assignee || task.due) && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {task.assignee}
                {!!task.assignee && !!task.due && " · "}
                {!!task.due &&
                  (isPastDue(task.due) && statusTone(task.status) !== "success" ? (
                    <Typography type="body-sm" weight="medium" className="text-danger">
                      {shortDate(task.due)}
                    </Typography>
                  ) : (
                    <Typography type="body-sm" color="muted">
                      {shortDate(task.due)}
                    </Typography>
                  ))}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <Status>{task.status}</Status>
        </Row>
      )}
    </Rows>
  );
}

export function FileList({ items }: { items: FileItem[] }) {
  return (
    <Rows items={items}>
      {(f, i) => {
        const Icon = FILE_ICONS[fileKind(f.name)];
        return (
          <Row key={f.id ?? i} url={f.url} className="items-center">
            <Icon className="size-5 text-muted" />
            <ListGroup.ItemContent className="min-w-0">
              <ListGroup.ItemTitle numberOfLines={1}>
                {f.name}
              </ListGroup.ItemTitle>
            </ListGroup.ItemContent>
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
      {(p, i) => (
        <Row key={p.id ?? i} url={p.url ?? (p.email ? `mailto:${p.email}` : undefined)} className="items-center">
          <Initials name={p.name} />
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle numberOfLines={1}>
              {p.name}
              {!!p.company && (
                <Typography color="muted" weight="normal">
                  {" "}
                  · {p.company}
                </Typography>
              )}
            </ListGroup.ItemTitle>
            {!!(p.email || p.phone) && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {[p.email, p.phone].filter(Boolean).join(" · ")}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
        </Row>
      )}
    </Rows>
  );
}

export function FinanceList({ items }: { items: FinanceItem[] }) {
  return (
    <Rows items={items}>
      {(f, i) => (
        <Row key={f.id ?? i} url={f.url}>
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle>{f.label}</ListGroup.ItemTitle>
            {!!(f.counterparty || f.date) && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {[f.counterparty, f.date && shortDate(f.date)].filter(Boolean).join(" · ")}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <View className="items-end gap-1">
            <Typography.Paragraph weight="medium" className={cn("tabular-nums", statusTone(f.status) === "danger" && "text-danger")}>
              {money(f.amount, f.currency)}
            </Typography.Paragraph>
            <Status>{f.status}</Status>
          </View>
        </Row>
      )}
    </Rows>
  );
}

export function CodeList({ items }: { items: CodeItem[] }) {
  return (
    <Rows items={items}>
      {(c, i) => (
        <Row key={c.id ?? i} url={c.url}>
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle>
              {c.number != null && (
                <Typography color="muted" className="tabular-nums">
                  #{c.number}{" "}
                </Typography>
              )}
              {c.title}
            </ListGroup.ItemTitle>
            {!!(c.repo || c.author) && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {[c.repo, c.author].filter(Boolean).join(" · ")}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <Status>{c.state}</Status>
        </Row>
      )}
    </Rows>
  );
}

export function GenericList({ items }: { items: GenericItem[] }) {
  return (
    <Rows items={items}>
      {(g, i) => (
        <Row key={g.id ?? i} url={g.url}>
          <ListGroup.ItemContent className="min-w-0 gap-0.5">
            <ListGroup.ItemTitle>{g.title}</ListGroup.ItemTitle>
            {!!g.subtitle && <ListGroup.ItemDescription numberOfLines={1}>{g.subtitle}</ListGroup.ItemDescription>}
          </ListGroup.ItemContent>
          {!!g.meta && <Meta>{g.meta}</Meta>}
        </Row>
      )}
    </Rows>
  );
}

/** Same columns as the web's Table, scrolled sideways when they don't fit. */
export function DataTable({ view }: { view: TableView }) {
  if (!view.rows.length) return <Empty />;
  const cell = "w-32 px-3 py-2";
  return (
    <Surface variant="secondary" className="p-0">
      <ScrollShadow LinearGradientComponent={LinearGradient} orientation="horizontal">
      <ScrollView horizontal nestedScrollEnabled>
        <View>
          <View className="flex-row">
            {view.columns.map((c) => (
              <Typography.Paragraph key={c} type="body-xs" color="muted" weight="semibold" numberOfLines={1} className={cell}>
                {c}
              </Typography.Paragraph>
            ))}
          </View>
          {view.rows.map((row, i) => (
            <Fragment key={i}>
              <Separator />
              <View className="flex-row">
                {view.columns.map((_, j) => {
                  const v = row[j];
                  return (
                    <Typography.Paragraph
                      key={j}
                      type="body-sm"
                      color={v == null ? "muted" : "default"}
                      align={typeof v === "number" ? "end" : "start"}
                      numberOfLines={1}
                      className={cn(cell, typeof v === "number" && "tabular-nums")}
                    >
                      {v == null ? "—" : String(v)}
                    </Typography.Paragraph>
                  );
                })}
              </View>
            </Fragment>
          ))}
        </View>
      </ScrollView>
      </ScrollShadow>
    </Surface>
  );
}
