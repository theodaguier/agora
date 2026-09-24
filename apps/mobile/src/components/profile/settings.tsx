import { common } from "@agora/core/i18n";
import { Chip, ControlField, FieldError, ListGroup, PressableFeedback, Separator, Typography, useToast } from "heroui-native";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { AccessibilityRole, AccessibilityState } from "react-native";
import { View } from "react-native";
import { CheckCircleIcon, WarningIcon, type IconComponent } from "@/components/icons";
import { tr } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/*
 * The building blocks of the Profile tab's screens, composed like HeroUI Native's ListGroup
 * examples (example/src/app/(home)/components/list-group.tsx): a muted header over a ListGroup,
 * rows separated by a Separator, pressable rows in PressableFeedback (Scale + Highlight),
 * switch rows as a ControlField, and a Toast for "saved" / "failed".
 */

/** A grouped section; rows are separated by a hairline, indented past their icon when they have one. */
export function Section({
  header,
  footer,
  inset = "text",
  children,
  className,
  bare,
}: {
  header?: string;
  footer?: ReactNode;
  /** Where separators start: under the text of rows with an icon, or at the row's edge. */
  inset?: "icon" | "text" | "none";
  children: ReactNode;
  className?: string;
  /** The children are already a group (a RadioGroup in a Surface, a Card): no ListGroup around them. */
  bare?: boolean;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn("gap-2", className)}>
      {!!header && (
        <Typography.Paragraph type="body-sm" color="muted" className="px-4">
          {header}
        </Typography.Paragraph>
      )}
      {bare
        ? children
        : rows.length > 0 && (
            <ListGroup>
              {rows.map((row, i) => (
                <Fragment key={row.key ?? i}>
                  {i > 0 && <Separator className={inset === "icon" ? "ml-13" : inset === "text" ? "mx-4" : ""} />}
                  {row}
                </Fragment>
              ))}
            </ListGroup>
          )}
      {typeof footer === "string" ? (
        <Typography.Paragraph type="body-sm" color="muted" className="px-4">
          {footer}
        </Typography.Paragraph>
      ) : (
        footer
      )}
    </View>
  );
}

/** The icon's color token, by meaning. */
const tones = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  default: "text-foreground",
};

/** The icon in front of a Settings row: a plain glyph, placed in ListGroup.ItemPrefix. */
export function RowIcon({ icon: Icon, tone = "default" }: { icon: IconComponent; tone?: keyof typeof tones }) {
  return <Icon size={20} className={tones[tone]} />;
}

/**
 * A pressable ListGroup row, as HeroUI's "With pressable feedback" ListGroup example: the root's
 * own scale off, the row scaled by PressableFeedback.Scale, an iOS highlight over it. The row inside
 * takes no touch itself, so the press (and VoiceOver's activation) goes to the PressableFeedback.
 */
export function PressableRow({
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** A ListGroup.Item. */
  children: ReactElement;
}) {
  return (
    <PressableFeedback
      animation={false}
      onPress={onPress && (() => (haptic.select(), onPress()))}
      onLongPress={onLongPress}
      isDisabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...accessibilityState }}
    >
      <PressableFeedback.Scale pointerEvents="none">{children}</PressableFeedback.Scale>
      <PressableFeedback.Highlight />
    </PressableFeedback>
  );
}

/** A row that opens something: optional icon, title, a value on the right and the chevron. */
export function LinkRow({
  icon,
  tone,
  title,
  description,
  value,
  badge,
  onPress,
  chevron = true,
  destructive,
  action,
  disabled,
}: {
  icon?: IconComponent;
  tone?: keyof typeof tones;
  title: string;
  description?: string | null;
  value?: string | null;
  /** A status on the right ("New"…): a HeroUI Chip. */
  badge?: string | null;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  /** A row that does something (add, sign in…): its title in the accent color, like iOS. */
  action?: boolean;
  disabled?: boolean;
}) {
  const row = (
    // Without `onPress`, the row takes no touch: a TapMenu around it opens on the tap.
    <ListGroup.Item pointerEvents={onPress ? undefined : "none"}>
      {icon && (
        <ListGroup.ItemPrefix>
          <RowIcon icon={icon} tone={tone} />
        </ListGroup.ItemPrefix>
      )}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle className={cn(destructive && "text-danger", action && "text-accent", disabled && "text-muted")} numberOfLines={1}>
          {title}
        </ListGroup.ItemTitle>
        {!!description && <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      {!!value && (
        <Typography.Paragraph color="muted" className="max-w-48 shrink" numberOfLines={1}>
          {value}
        </Typography.Paragraph>
      )}
      {!!badge && (
        <Chip size="sm" variant="primary" color="accent">
          {badge}
        </Chip>
      )}
      {chevron && <ListGroup.ItemSuffix />}
    </ListGroup.Item>
  );
  return onPress ? (
    <PressableRow onPress={onPress} disabled={disabled} accessibilityLabel={[title, description, value, badge].filter(Boolean).join(", ")}>
      {row}
    </PressableRow>
  ) : (
    row
  );
}

/** A row carrying its own control on the right (a select, a picker…). */
export function ControlRow({ title, description, children, className }: { title: string; description?: string | null; children: ReactNode; className?: string }) {
  return (
    <ListGroup.Item disabled className={className}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
        {!!description && <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>{children}</ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** A switch row, as HeroUI's ListGroup "Custom suffix" example: a ControlField the whole row toggles. */
export function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled,
  prefix,
}: {
  title: string;
  description?: string | null;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Before the title: an icon, an avatar. */
  prefix?: ReactNode;
}) {
  return (
    <ControlField isSelected={value} onSelectedChange={(v) => (haptic.select(), onChange(v))} isDisabled={disabled} accessibilityLabel={title} className="flex-row items-center gap-3 px-4 py-4">
      {prefix}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
        {!!description && <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      <ControlField.Indicator />
    </ControlField>
  );
}

/** An inline error under a section, in the danger color. */
export function ErrorNote({ error }: { error: unknown }) {
  return (
    <FieldError isInvalid={!!error} className="px-4">
      {error instanceof Error ? error.message : String(error ?? "")}
    </FieldError>
  );
}

/**
 * The HeroUI Toast of a one-off outcome: `saved()` after a change went through (a label of its
 * own if given), `failed(error)` when it didn't. Toasts show above the screen, not above a
 * form sheet: a sheet keeps its errors inline.
 */
export function useFeedback() {
  const { toast } = useToast();
  const c = tr(common);
  return {
    saved: (label?: string) => {
      haptic.success();
      toast.show({ variant: "success", label: label ?? c.saved, icon: <CheckCircleIcon size={18} className="text-success" /> });
    },
    failed: (error: unknown) =>
      toast.show({
        variant: "danger",
        label: c.unknownError,
        description: error instanceof Error ? error.message : undefined,
        icon: <WarningIcon size={18} className="text-danger" />,
      }),
  };
}
