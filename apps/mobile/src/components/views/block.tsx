import type { StatusTone } from "@agora/core";
import { Card, CloseButton, ListGroup, Popover, Separator, Surface, Typography } from "heroui-native";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { withTap } from "@/lib/haptics";
import { usePopoverInsets } from "@/lib/popover-insets";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/views/block.tsx: the anatomy shared by every block a bot sends in a
 * conversation (choices, questions, requests, views). One white card at the Geist density (12 pt
 * around and between its parts), a header on one line over a hairline, one grouped zone, the actions.
 */

/** The block's Card (web: Card size sm): white, a 1 pt border, 12 pt inside. */
export const blockCard = "w-full gap-3 rounded-xl border border-border bg-background px-3 py-3";

/** A status tone as the color of its dot and its words (`info`: in progress, the brand blue). */
const DOT: Record<StatusTone, string> = {
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-brand",
  neutral: "bg-muted",
};
const TONE_TEXT: Record<StatusTone, string> = {
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
  info: "text-brand",
  neutral: "text-muted",
};

/**
 * A block's header on one line, as Linear's (web: BlockHeader): what it is (its icon, its title),
 * where it comes from in grey beside it, its state or the close button on the right; a hairline under
 * it, edge to edge. A long title wraps and sends the grey line under it.
 */
export function BlockHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  titleLines?: number;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <Card.Header className="gap-3">
      <View className="flex-row items-center gap-2">
        {!!props.icon && <View className="shrink-0">{props.icon}</View>}
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Card.Title numberOfLines={props.titleLines} className="shrink text-subheadline font-medium">
            {props.title}
          </Card.Title>
          {!!props.description && (
            <Card.Description numberOfLines={1} className="shrink text-footnote text-subtle">
              {props.description}
            </Card.Description>
          )}
        </View>
        {!!props.status && <View className="shrink-0">{props.status}</View>}
        {!!props.onClose && <CloseButton accessibilityLabel={props.closeLabel} onPress={withTap(props.onClose)} className="-my-1 -mr-1" />}
      </View>
      <Separator className="-mx-3" />
    </Card.Header>
  );
}

/** A status: a small dot and its words, both in its tone; a tap explains it when `help` is given. */
export function StatusLine({ tone, label, help }: { tone: StatusTone; label: string; help?: string }) {
  const insets = usePopoverInsets();
  const line = (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-1.5 rounded-full", DOT[tone])} />
      <Typography type="body-xs" className={TONE_TEXT[tone]}>
        {label}
      </Typography>
    </View>
  );
  if (!help) return line;
  return (
    <Popover>
      <Popover.Trigger accessibilityRole="button" accessibilityLabel={label} className="self-start">
        {line}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" width={300} placement="bottom" align="start" insets={insets} className="gap-1">
          <Popover.Title>{label}</Popover.Title>
          <Popover.Description>{help}</Popover.Description>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

/** The rows of a group, fragments unwrapped, empty ones dropped. */
function flatten(children: ReactNode): ReactElement[] {
  return Children.toArray(children).flatMap((c) =>
    !isValidElement(c) ? [] : c.type === Fragment ? flatten((c.props as { children?: ReactNode }).children) : [c],
  );
}

/** The block's grouped zone: a gray rounded group, its rows split by hairlines (`inset`: their left margin). */
export function BlockGroup({ children, inset = "mx-3.5", className }: { children: ReactNode; inset?: string; className?: string }) {
  const rows = flatten(children);
  return (
    <ListGroup className={cn("rounded-[14px] shadow-none", className)}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 && <Separator className={inset} />}
          {row}
        </Fragment>
      ))}
    </ListGroup>
  );
}

/** A key/value row of a BlockGroup: the key muted, the value medium (monospace for addresses, commands, identifiers). */
export function MetaRow({ label, children, mono, onPress }: { label: string; children: ReactNode; mono?: boolean; onPress?: () => void }) {
  return (
    <ListGroup.Item
      onPress={onPress && withTap(onPress)}
      accessibilityRole={onPress ? "link" : undefined}
      className="items-start gap-3 px-3.5 py-2.5"
    >
      <Typography type="body-sm" color="muted" className="w-[88px] pt-px">
        {label}
      </Typography>
      {mono ? (
        <Typography selectable={!onPress} className={cn("min-w-0 flex-1 pt-0.5 font-mono text-footnote", onPress && "text-brand")}>
          {children}
        </Typography>
      ) : (
        <Typography weight="medium" className={cn("min-w-0 flex-1", onPress && "text-brand")}>
          {children}
        </Typography>
      )}
    </ListGroup.Item>
  );
}

/** A command or code, plain, on the gray surface. */
export function CodeBlock({ children }: { children: string }) {
  return (
    <Surface className="rounded-[14px] px-3.5 py-3 shadow-none">
      <Typography selectable className="font-mono text-footnote">
        {children}
      </Typography>
    </Surface>
  );
}
