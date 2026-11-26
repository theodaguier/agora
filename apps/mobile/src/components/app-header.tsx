import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { PressableFeedback, Typography } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { ChevronDownIcon, MenuIcon, type IconComponent } from "@/components/icons";
import { useDrawerBadge, useOpenDrawer } from "@/components/drawer";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

/*
 * Figma « Mobile — ChatGPT 1:1 (26 nov.) », measured on ChatGPT's App Store captures: the header of the
 * drawer's screens is no bar. White round buttons (44 pt, a soft shadow) 16 pt from the edges, the menu
 * on the left, a capsule of actions on the right, the title in the middle (with its chevron when it opens
 * a menu), over a fade of the page so what scrolls under it stays readable.
 */

const messages = defineMessages({ en: { menu: "Menu" }, fr: { menu: "Menu" } });

/** The header's height under the status bar: the 44 pt buttons and their margins. */
export const APP_HEADER_HEIGHT = 60;

/** The total height the content leaves to the header. */
export function useAppHeaderHeight() {
  return useSafeAreaInsets().top + APP_HEADER_HEIGHT;
}

const shadow = { boxShadow: "0 4px 20px rgba(0, 0, 0, 0.10)" } as const;

/** A white round button of the header. */
export function HeaderCircle({ icon: Icon, label, onPress, badge, disabled }: { icon: IconComponent; label: string; onPress: () => void; badge?: number; disabled?: boolean }) {
  return (
    <PressableFeedback isDisabled={disabled} onPress={withTap(onPress)} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} accessibilityState={{ disabled }} className={`size-11 items-center justify-center rounded-full bg-background ${disabled ? "opacity-40" : ""}`} style={shadow}>
      <Icon size={22} className="text-foreground" />
      {!!badge && (
        <View className="absolute -end-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1">
          <Typography className="text-[11px] font-bold text-white">{badge > 99 ? "99+" : String(badge)}</Typography>
        </View>
      )}
    </PressableFeedback>
  );
}

/** The capsule of the header's actions on the right: its icons side by side on one white pill. */
export function HeaderCapsule({ actions }: { actions: ({ icon: IconComponent; label: string; onPress: () => void } | ReactNode)[] }) {
  return (
    <View className="h-11 flex-row items-center gap-1 rounded-full bg-background px-1.5" style={shadow}>
      {actions.map((a, i) =>
        a && typeof a === "object" && "icon" in a ? (
          <PressableFeedback key={a.label} onPress={withTap(a.onPress)} accessibilityRole="button" accessibilityLabel={a.label} className="size-9 items-center justify-center rounded-full">
            <a.icon size={21} className="text-foreground" />
          </PressableFeedback>
        ) : (
          <View key={i}>{a}</View>
        ),
      )}
    </View>
  );
}

/** The menu button: opens the drawer; its badge counts what waits elsewhere. */
export function MenuCircle({ current }: { current?: string }) {
  const open = useOpenDrawer();
  return <HeaderCircle icon={MenuIcon} label={messages.menu} onPress={open} badge={useDrawerBadge(current)} />;
}

/** The title in the middle: a line, and under it a grey one (or coloured, a state); a chevron when it opens a menu. */
export function HeaderTitle({ title, subtitle, subtitleClassName, chevron, onPress, accessibilityLabel }: { title: string; subtitle?: string | null; subtitleClassName?: string; chevron?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const body = (
    <View className="max-w-[200px] items-center">
      <View className="flex-row items-center gap-1">
        <Typography weight="semibold" numberOfLines={1} className="text-body">
          {title}
        </Typography>
        {chevron && <ChevronDownIcon size={14} className="text-subtle" />}
      </View>
      {!!subtitle && (
        <Typography numberOfLines={1} className={subtitleClassName ?? "text-caption1 text-muted"}>
          {subtitle}
        </Typography>
      )}
    </View>
  );
  return onPress ? (
    <PressableFeedback onPress={withTap(onPress)} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </PressableFeedback>
  ) : (
    body
  );
}

/**
 * The header itself, over the screen (the native bar hidden): the fade, then left, title and right.
 * `title` may be any node (a menu around the title); `left` defaults to the menu button.
 */
export function AppHeader({ left, title, right, current, ground = "--color-background" }: { left?: ReactNode; title?: ReactNode; right?: ReactNode; current?: string; /** The page's colour, for its fade: the grouped ground of a settings page. */ ground?: string }) {
  const insets = useSafeAreaInsets();
  const background = useCSSVariable(ground) as string;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View pointerEvents="box-none" className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: insets.top }}>
        <LinearGradient pointerEvents="none" colors={[background, background, `${background}00`]} locations={[0, 0.7, 1]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + APP_HEADER_HEIGHT + 18 }} />
        <View pointerEvents="box-none" className="flex-row items-center justify-between px-4" style={{ height: APP_HEADER_HEIGHT }}>
          <View className="min-w-11">{left ?? <MenuCircle current={current} />}</View>
          <View pointerEvents="box-none" className="absolute inset-x-0 items-center" style={{ top: 0, bottom: 0, justifyContent: "center" }}>
            {title}
          </View>
          <View className="min-w-11 items-end">{right}</View>
        </View>
      </View>
    </>
  );
}
