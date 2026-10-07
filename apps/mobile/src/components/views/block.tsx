import type { StatusTone } from "@agora/core";
import { Card, CloseButton, ListGroup, Popover, Separator, Surface, Typography } from "heroui-native";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { withTap } from "@/lib/haptics";
import { usePopoverInsets } from "@/lib/popover-insets";
import { cn } from "@/lib/utils";

/*
 * The anatomy shared by every block a bot sends in a conversation (the Figma « Blocs IA — v2 »):
 * one white card, a header (the title as its only strong element, a muted line, an optional
 * status dot), one grouped zone, then the actions.
 */

/** The block's Card: white, a 1px border, radius 22. */
export const blockCard = "w-full max-w-[92%] gap-4 rounded-[22px] border border-border bg-background px-[18px] py-4";

/** A status tone as the color of its dot (`info`: in progress, the brand blue). */
const DOT: Record<StatusTone, string> = {
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-brand",
  neutral: "bg-muted",
};

/** Header of a block: optional `icon` inline before the title, the muted line, the status, the close button. */
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
    <Card.Header className="flex-row items-start gap-3">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-start gap-2">
          {!!props.icon && <View className="pt-0.5">{props.icon}</View>}
          <Card.Title numberOfLines={props.titleLines} className="min-w-0 flex-1 text-headline font-semibold">
            {props.title}
          </Card.Title>
        </View>
        {!!props.description && <Card.Description className="text-subheadline">{props.description}</Card.Description>}
        {props.status}
      </View>
      {!!props.onClose && <CloseButton accessibilityLabel={props.closeLabel} onPress={withTap(props.onClose)} className="-mr-1" />}
    </Card.Header>
  );
}

/** A small colored dot and a muted label; a tap explains the status when `help` is given. */
export function StatusLine({ tone, label, help }: { tone: StatusTone; label: string; help?: string }) {
  const insets = usePopoverInsets();
  const line = (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-[7px] rounded-full", DOT[tone])} />
      <Typography type="body-sm" color="muted">
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
