import { GlassView as LiquidGlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { GlassView, ListGroup, PressableFeedback, Separator, Typography } from "heroui-native";
import { Fragment, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useUniwind } from "uniwind";
import { AtIcon, ClockIcon, CommandIcon, PackageIcon, PlugIcon } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

/*
 * apps/web/src/components/SlashMenu.tsx. On the phone the palette is a list group above the field,
 * rows sized for a finger; no keyboard navigation (a tap picks), so no "active" row.
 * It floats over the thread on HeroUI's glass: the list group goes transparent over a GlassView background
 * (a native blur on iOS, the overlay color flattened elsewhere), or Liquid Glass on iOS 26. The model picker floats the same way.
 */

export type SlashItem = {
  key: string;
  /** command: a Hermes session command (/new, /compact…), shown with its slash. */
  kind: "skill" | "mcp" | "routine" | "command" | "action" | "agent" | "person";
  /** Routine: its Hermes job id. */
  id?: string;
  /** Group skill: the bot it belongs to. */
  agentId?: string;
  name: string;
  description: string;
  /** Replaces the kind's icon: a bot's or colleague's avatar. */
  media?: ReactNode;
  run?: () => void;
};

const icons = { skill: PackageIcon, mcp: PlugIcon, routine: ClockIcon, command: CommandIcon, action: CommandIcon, agent: AtIcon, person: AtIcon };

const messages = defineMessages({
  en: {
    kinds: { skill: "Skill", mcp: "Connector", routine: "Routine", command: "Command", action: "Action", agent: "Bot", person: "Colleague" } as Record<SlashItem["kind"], string>,
    commands: "Commands",
    empty: "No commands.",
  },
  fr: {
    kinds: { skill: "Compétence", mcp: "Connecteur", routine: "Routine", command: "Commande", action: "Action", agent: "Bot", person: "Collègue" },
    commands: "Commandes",
    empty: "Aucune commande.",
  },
});

/**
 * "/" palette (session commands, skills, connectors, routines, actions) and "@" palette (group bots,
 * colleagues), filtered as the user types. The keyboard stays open: a tap picks a row without
 * leaving the field.
 */
export function SlashMenu({ items, onPick }: { items: SlashItem[]; onPick: (item: SlashItem) => void }) {
  const t = messages;
  return (
    <FloatingMenu label={t.commands}>
      {items.length === 0 && <MenuEmpty>{t.empty}</MenuEmpty>}
      {items.map((item, i) => {
        const Icon = icons[item.kind];
        return (
          <MenuRow
            key={item.key}
            first={i === 0}
            media={item.media ?? <Icon className="size-5 text-muted" />}
            title={item.kind === "command" ? `/${item.name}` : item.name}
            description={item.description}
            suffix={
              <Typography type="body-sm" color="muted">
                {t.kinds[item.kind]}
              </Typography>
            }
            onPress={() => onPick(item)}
          />
        );
      })}
    </FloatingMenu>
  );
}

/** iOS 26: the menus are Liquid Glass; elsewhere HeroUI's frosted GlassView (expo-blur). */
const liquid = isGlassEffectAPIAvailable();

/**
 * The floating palette over the thread, shared by the "/" and "@" menus and the model picker.
 * On iOS 26 the glass is the container itself, never clipped nor behind an overflow-hidden parent
 * (as a background layer in a clipping view it drew nothing); its content clips to the same corners.
 * Elsewhere, HeroUI's standalone glass: a rounded, clipping container, the GlassView, the content above it.
 * `header`: what stays above the scrolling rows (the model picker's search). `list`: a virtualized list
 * of its own, in place of the plain scroll view around `children` (the model picker: hundreds of models).
 */
export function FloatingMenu({ label, header, list, children }: { label: string; header?: ReactNode; list?: ReactNode; children?: ReactNode }) {
  const { theme } = useUniwind();
  const content = (
    <>
      {header}
      <ListGroup variant="transparent" accessibilityLabel={label}>
        {list ?? (
          <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} style={{ maxHeight: MENU_MAX_HEIGHT }}>
            {children}
          </ScrollView>
        )}
      </ListGroup>
    </>
  );
  if (liquid)
    return (
      // The app's theme, not the phone's appearance ("auto" drew a white glass over the dark theme).
      <LiquidGlassView glassEffectStyle="regular" colorScheme={theme.endsWith("dark") ? "dark" : "light"} style={{ borderRadius: 24, borderCurve: "continuous" }}>
        <View className="overflow-hidden rounded-3xl" style={{ borderCurve: "continuous" }}>
          {content}
        </View>
      </LiquidGlassView>
    );
  return (
    <View className="relative overflow-hidden rounded-3xl" style={{ borderCurve: "continuous" }}>
      <GlassView intensity={80} />
      {content}
    </View>
  );
}

/** The height the floating menus scroll past: about three rows and a half, the next one cut to show it scrolls. */
export const MENU_MAX_HEIGHT = 216;

/** The row shown when nothing matches. */
export function MenuEmpty({ children }: { children: string }) {
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemDescription>{children}</ListGroup.ItemDescription>
      </ListGroup.ItemContent>
    </ListGroup.Item>
  );
}

/** One row of a floating menu: a tap picks it. */
export function MenuRow({
  first,
  media,
  title,
  description,
  suffix,
  selected,
  disabled,
  onPress,
}: {
  first?: boolean;
  media: ReactNode;
  title: string;
  description?: string;
  suffix?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Fragment>
      {!first && <Separator className="mx-4" />}
      {/* The list group's pressable pattern: the feedback carries the press, the row only lays out. */}
      <PressableFeedback
        animation={false}
        accessibilityRole="menuitem"
        accessibilityState={{ selected, disabled }}
        isDisabled={disabled}
        onPress={withTap(onPress)}
      >
        <PressableFeedback.Scale>
          <ListGroup.Item disabled>
            <ListGroup.ItemPrefix>{media}</ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>{title}</ListGroup.ItemTitle>
              {!!description && <ListGroup.ItemDescription numberOfLines={1}>{description}</ListGroup.ItemDescription>}
            </ListGroup.ItemContent>
            {suffix && <ListGroup.ItemSuffix>{suffix}</ListGroup.ItemSuffix>}
          </ListGroup.Item>
        </PressableFeedback.Scale>
        <PressableFeedback.Highlight />
      </PressableFeedback>
    </Fragment>
  );
}
