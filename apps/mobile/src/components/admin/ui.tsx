import { common } from "@agora/core/i18n";
import { Redirect, Stack } from "expo-router";
import {
  Alert,
  Button,
  FieldError,
  Input,
  InputGroup,
  Label,
  ListGroup,
  Popover,
  PressableFeedback,
  Separator,
  SkeletonGroup,
  Spinner,
  Surface,
  Switch,
  TextArea,
  TextField,
  Typography,
  useToast,
  type InputRef,
} from "heroui-native";
import { Children, forwardRef, Fragment, useEffect, useMemo, useState, type ComponentProps, type ElementRef, type ReactElement, type ReactNode } from "react";
import { RefreshControl, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from "react-native";
import { Circle, Path } from "react-native-svg";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { createIcon, EyeIcon, type IconComponent } from "@/components/icons";
import { circle, Hole } from "@/components/icons/create-icon";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { useAdminAccess } from "@/lib/agents-admin";
import { LongPressMenu, TapMenu, type MenuEntry, type SFSymbol } from "@/components/menus";
import { cn, rowKey } from "@/lib/utils";

/* apps/web/src/components/admin/ui.tsx, as iOS grouped settings built from the HeroUI Native parts. */

const messages = defineMessages({
  en: { show: "Show", hide: "Hide", help: "More information" },
  fr: { show: "Afficher", hide: "Masquer", help: "En savoir plus" },
});

/** Strips a field's own box: in a form it is drawn by the group it sits in (FormField, FieldRow). */
const BARE_FIELD = "border-transparent bg-transparent shadow-none ios:outline-transparent ios:focus:outline-transparent android:border-transparent android:focus:border-transparent";

/** "i" in a circle, in the house icon style: the trigger of a help popover. */
const InfoIcon = createIcon("info", {
  fill: <Circle cx="12" cy="12" r="10" />,
  cut: (
    <>
      <Path d="M12 11v5.5" />
      <Hole d={circle(12, 7.75, 1.25)} />
    </>
  ),
});

/** The eye, struck through: the value is shown, a tap hides it. */
const EyeOffIcon = createIcon("eye-off", {
  fill: <Path d="M2 12c1.9-4.6 5.6-7.5 10-7.5s8.1 2.9 10 7.5c-1.9 4.6-5.6 7.5-10 7.5S3.9 16.6 2 12z" />,
  cut: (
    <>
      <Circle cx="12" cy="12" r="3.25" strokeWidth={1.5} />
      <Path d="M4 4l16 16" strokeWidth={4.5} />
    </>
  ),
  line: <Path d="M4 4l16 16" />,
});

/** Admin screens only: a member who lands here goes back to their profile. */
export function AdminGate({ children }: { children: ReactNode }) {
  const access = useAdminAccess();
  if (access === "denied") return <Redirect href="/profile" />;
  if (access === "pending") return <Spinner className="mt-24 self-center" />;
  return <>{children}</>;
}

/** Grouped background under a large title; pull to refresh when `onRefresh` is given. */
export function SettingsScroll({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      className="bg-background"
      contentContainerClassName="gap-7 px-4 pb-16 pt-2"
      refreshControl={
        onRefresh && (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              haptic.tap();
              setRefreshing(true);
              await onRefresh().catch(() => {});
              setRefreshing(false);
            }}
          />
        )
      }
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

/** Intro of a screen, the web's SectionHeader text (its title is the header's). */
export function Intro({ children }: { children: ReactNode }) {
  return (
    <Typography.Paragraph type="body-sm" color="muted" className="px-1">
      {children}
    </Typography.Paragraph>
  );
}

/** Name of a grouped section, as the web's SettingsGroup title: medium weight, above the group's edge. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Typography.Paragraph type="body-sm" weight="medium" className={className ?? "px-1"}>
      {children}
    </Typography.Paragraph>
  );
}

/** Footnote under a grouped section. */
export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <Typography.Paragraph type="body-xs" color="muted" className="px-4">
      {children}
    </Typography.Paragraph>
  );
}

/** An "i" that explains something in a HeroUI Popover (title and description), like the popover example. */
export function InfoPopover({ title, description, label }: { title: string; description: string; label?: string }) {
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={label ?? `${messages.help}: ${title}`}>
          <InfoIcon className="size-4 text-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" width={300} placement="bottom" className="gap-1 px-5 py-4">
          <Popover.Title>{title}</Popover.Title>
          <Popover.Description>{description}</Popover.Description>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

/**
 * An inset grouped section: header (with an optional help popover or action), rows separated by
 * hairlines, footnote below. `null`/`false` children are skipped, so separators stay between visible rows.
 * `bare`: the children are already a group (a ListGroup of their own, a form card).
 */
export function Section({
  title,
  footer,
  children,
  action,
  help,
  bare,
}: {
  title?: string;
  footer?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  bare?: boolean;
  /** Explanation of the section, behind an "i" next to its title. */
  help?: string;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {(title || action || help) && (
        <View className="min-h-8 flex-row items-center justify-between gap-3 px-1">
          <View className="flex-1 flex-row items-center gap-1">
            {!!title && <SectionTitle className="shrink">{title}</SectionTitle>}
            {!!help && <InfoPopover title={title ?? ""} description={help} />}
          </View>
          {action}
        </View>
      )}
      {bare && children}
      {!bare && rows.length > 0 && (
        <ListGroup>
          {rows.map((row, i) => (
            <Fragment key={rowKey(row, i)}>
              {i > 0 && <Separator className="mx-4" />}
              {row}
            </Fragment>
          ))}
        </ListGroup>
      )}
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

type PressableRowProps = Omit<ComponentProps<typeof PressableFeedback>, "children" | "animation"> & {
  children: ReactNode;
  /** Classes of the ListGroup.Item inside (layout only). */
  itemClassName?: string;
};

/**
 * A ListGroup row that opens something: the list-group example's pressable row
 * (PressableFeedback › Scale › ListGroup.Item, then the iOS Highlight).
 * Takes the Pressable props (onPress, onLongPress…), so a Link `asChild` or a RowMenu can drive it.
 */
export const PressableRow = forwardRef<ElementRef<typeof PressableFeedback>, PressableRowProps>(function PressableRow({ children, itemClassName, ...props }, ref) {
  const { onPress } = props;
  return (
    <PressableFeedback
      ref={ref}
      animation={false}
      accessibilityRole="button"
      {...props}
      onPress={typeof onPress === "function" ? (e) => (haptic.select(), onPress(e)) : onPress}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled className={itemClassName}>
          {children}
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Highlight />
    </PressableFeedback>
  );
});

const tones = { success: "text-success", warning: "text-warning", danger: "text-danger" };

/**
 * The web's SettingTile: a settings row's icon in a muted tile, as its ListGroup.ItemPrefix. Rows whose
 * media says more (an avatar, a logo) keep it. `tone`: a state the icon shows (do not disturb on…).
 */
export function SettingTile({ icon: Icon, tone }: { icon: IconComponent; tone?: "success" | "warning" | "danger" }) {
  return (
    <ListGroup.ItemPrefix>
      <Surface variant="secondary" className="size-8 items-center justify-center rounded-lg p-0 shadow-none">
        <Icon size={16} className={tone ? tones[tone] : "text-muted"} />
      </Surface>
    </ListGroup.ItemPrefix>
  );
}

/**
 * A row that opens something, as an entry of the web's settings navigation: its tile, title, an
 * optional value and the chevron. Takes the Pressable props, so a Link `asChild` or a TapMenu drives it.
 */
export const LinkRow = forwardRef<
  ElementRef<typeof PressableFeedback>,
  Omit<PressableRowProps, "children"> & {
    icon?: IconComponent;
    tone?: "success" | "warning" | "danger";
    title: string;
    description?: string | null;
    value?: string | null;
    /** A status on the right ("New"…). */
    badge?: ReactNode;
    destructive?: boolean;
    chevron?: boolean;
  }
>(function LinkRow({ icon, tone, title, description, value, badge, destructive, chevron = true, ...props }, ref) {
  return (
    <PressableRow ref={ref} accessibilityLabel={[title, description, value].filter(Boolean).join(", ")} {...props}>
      {icon && <SettingTile icon={icon} tone={tone} />}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1} className={destructive ? "text-danger" : undefined}>
          {title}
        </ListGroup.ItemTitle>
        {!!description && <ListGroup.ItemDescription numberOfLines={2}>{description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      {!!value && (
        <Typography.Paragraph type="body-sm" color="muted" numberOfLines={1} className="max-w-44 shrink">
          {value}
        </Typography.Paragraph>
      )}
      {badge}
      {chevron && <ListGroup.ItemSuffix />}
    </PressableRow>
  );
});

/** The web's SettingsRow: what it is on the left (a hint under it), its value or control on the right. */
export function SettingsRow({ label, hint, value, children }: { label: string; hint?: string | null; value?: string | null; children?: ReactNode }) {
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
        {!!hint && <ListGroup.ItemDescription numberOfLines={2}>{hint}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      {!!value && (
        <Typography.Paragraph type="body-sm" color="muted" numberOfLines={1} selectable className="max-w-52 shrink">
          {value}
        </Typography.Paragraph>
      )}
      {children}
    </ListGroup.Item>
  );
}

/**
 * A form field as a row of a group (the web's ProfileFields `rows`): its label on the left, the
 * field on the right; `top` aligns the label with the first line of a multi-line field.
 */
export function FieldRow({ label, required, invalid, top, children }: { label: string; required?: boolean; invalid?: boolean; top?: boolean; children: ReactNode }) {
  return (
    <TextField isRequired={required} isInvalid={invalid} className={cn("flex-row gap-2 pl-4", top ? "items-start" : "items-center")}>
      <Label className={cn("w-24", top && "pt-3")}>{label}</Label>
      <View className="flex-1 gap-1">{children}</View>
    </TextField>
  );
}

/** Props RowMenu hands to its row, so a long press (or a VoiceOver action) opens the menu. */
export type RowMenuTargetProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

/** A row with a switch, title and help (the web's horizontal Field + Switch). */
export function SwitchRow(
  rowProps: {
    title: string;
    description?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    prefix?: ReactNode;
  } & RowMenuTargetProps,
) {
  const props = { ...rowProps, onChange: (value: boolean) => (haptic.select(), rowProps.onChange(value)) };
  return (
    <ListGroup.Item
      disabled={props.disabled}
      onPress={withTap(() => props.onChange(!props.value))}
      onLongPress={props.onLongPress}
      accessibilityRole="switch"
      accessibilityLabel={props.title}
      accessibilityState={{ checked: props.value, disabled: props.disabled }}
      accessibilityActions={props.accessibilityActions}
      onAccessibilityAction={props.onAccessibilityAction}
    >
      {props.prefix && <ListGroup.ItemPrefix>{props.prefix}</ListGroup.ItemPrefix>}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{props.title}</ListGroup.ItemTitle>
        {!!props.description && <ListGroup.ItemDescription numberOfLines={2}>{props.description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Switch isSelected={props.value} isDisabled={props.disabled} onSelectedChange={props.onChange} />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : tr(common).unknownError);

/** Error of a query (something that stays wrong while the screen is open), in a danger alert. */
export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error && !title) return null;
  const message = error ? errorMessage(error) : undefined;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title ?? message}</Alert.Title>
        {title && message && <Alert.Description>{message}</Alert.Description>}
      </Alert.Content>
    </Alert>
  );
}

/**
 * The outcome of an action (saved, deleted, sent, failed) in a HeroUI Toast, instead of text left on
 * the screen. `failed` takes the error of a mutation; `label` gives it a title above the message.
 */
export function useAdminToast() {
  const { toast } = useToast();
  return useMemo(
    () => ({
      success: (label?: string, description?: string) => (haptic.success(), toast.show({ variant: "success", label: label ?? tr(common).saved, description })),
      deleted: (label?: string) => (haptic.success(), toast.show({ variant: "success", label: label ?? tr(common).deleted })),
      info: (label: string, description?: string) => toast.show({ variant: "default", label, description }),
      failed: (error: unknown, label?: string) =>
        toast.show({ variant: "danger", label: label ?? errorMessage(error), description: label ? errorMessage(error) : undefined }),
    }),
    [toast],
  );
}

/** A secret value: the input-group example's password field, with its show / hide button; bare in its form group. */
export function SecretInput({
  showLabel = messages.show,
  hideLabel = messages.hide,
  ...props
}: Omit<ComponentProps<typeof InputGroup.Input>, "secureTextEntry"> & { showLabel?: string; hideLabel?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroup.Input autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" background={null} {...props} className={cn(BARE_FIELD, "pl-4", props.className)} secureTextEntry={!shown} />
      <InputGroup.Suffix className="pr-4">
        <PressableFeedback hitSlop={20} accessibilityRole="button" accessibilityLabel={shown ? hideLabel : showLabel} onPress={withTap(() => setShown((s) => !s))}>
          {shown ? <EyeOffIcon size={16} className="text-field-placeholder" /> : <EyeIcon size={16} className="text-field-placeholder" />}
        </PressableFeedback>
      </InputGroup.Suffix>
    </InputGroup>
  );
}

/**
 * A search over a list, as iOS does it: the navigation bar's own search field (UISearchController),
 * under the screen's title, never a box in the page. `value` stays the caller's state.
 */
export function SearchBox({ onChange, placeholder }: { value?: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <Stack.SearchBar
      placeholder={placeholder}
      autoCapitalize="none"
      hideWhenScrolling={false}
      onChangeText={(e) => onChange(e.nativeEvent.text)}
      onCancelButtonPress={() => onChange("")}
    />
  );
}

/*
 * Forms as iOS draws them (Settings, Contacts): each field sits bare in the white card of its group,
 * its name above the group, its help or its error under it. Never a bordered box inside a card.
 */


/** A one-line field inside a form group (FormField, FieldRow). */
export const FormInput = forwardRef<InputRef, ComponentProps<typeof Input>>(function FormInput({ className, ...props }, ref) {
  return <Input ref={ref} background={null} className={cn(BARE_FIELD, "px-4", className)} {...props} />;
});

/** A multi-line field inside a form group. */
export const FormTextArea = forwardRef<InputRef, ComponentProps<typeof TextArea>>(function FormTextArea({ className, ...props }, ref) {
  return <TextArea ref={ref} background={null} className={cn(BARE_FIELD, "min-h-28 px-4 py-3", className)} {...props} />;
});

/**
 * A field as an iOS form group: its name (an asterisk when required) above the white card that holds
 * it, then its error in red or its help in grey. Children: a FormInput / FormTextArea / SecretInput
 * (bare), or several rows separated by hairlines.
 */
export function FormField({
  label,
  required,
  invalid,
  error,
  help,
  children,
}: {
  label?: string;
  required?: boolean;
  invalid?: boolean;
  error?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TextField isRequired={required} isInvalid={invalid} className="gap-2">
      {!!label && <SectionTitle>{required ? `${label} *` : label}</SectionTitle>}
      <ListGroup>{children}</ListGroup>
      {invalid && error ? (
        <FieldError className="px-4">{error}</FieldError>
      ) : typeof help === "string" ? (
        <SectionFooter>{help}</SectionFooter>
      ) : (
        help
      )}
    </TextField>
  );
}

/** Placeholder rows while a list loads (the skeleton example's list rows); nothing for a quick answer, as the web's Loading. */
export function LoadingRows({ rows = 3, avatar = true }: { rows?: number; avatar?: boolean }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLate(true), 300);
    return () => clearTimeout(id);
  }, []);
  if (!late) return null;
  return (
    <ListGroup>
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator className="mx-4" />}
          <SkeletonGroup isLoading isSkeletonOnly className="flex-row items-center gap-3 px-4 py-3">
            {avatar && <SkeletonGroup.Item className="size-10 rounded-full" />}
            <View className="flex-1 gap-2">
              <SkeletonGroup.Item className="h-4 w-1/2 rounded-md" />
              <SkeletonGroup.Item className="h-3 w-3/4 rounded-md" />
            </View>
          </SkeletonGroup>
        </Fragment>
      ))}
    </ListGroup>
  );
}

/** SF Symbol of a menu action. */
export type { SFSymbol } from "@/components/menus";

export type RowAction = { label: string; icon?: SFSymbol; destructive?: boolean; disabled?: boolean; onPress: () => void };

/**
 * The actions of a row, in a HeroUI Menu: on a long press, or on a tap with `openOnPress`
 * (rows whose only use is these actions). `items`: entries shown before the actions (a submenu).
 */
export function RowMenu({ actions, items, openOnPress, children }: { actions: RowAction[]; items?: MenuEntry[]; openOnPress?: boolean; children: ReactElement }) {
  const entries: MenuEntry[] = [...(items ?? []), ...(items?.length && actions.length ? ["divider" as const] : []), ...actions];
  return openOnPress ? <TapMenu actions={entries}>{children}</TapMenu> : <LongPressMenu actions={entries}>{children}</LongPressMenu>;
}
