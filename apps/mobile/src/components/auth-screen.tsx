import { Avatar, Typography } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentAvatar } from "@/components/agent-avatar";

/**
 * The frame of the sign-in screens: the organization's mark, a large title and its hint,
 * then the form, centered and scrolling above the keyboard (the web's `max-w-sm` column). The other
 * ways in (QR code, invitation), when given, sit at the bottom of the screen, under the thumb.
 */
export function AuthScreen({
  children,
  title,
  hint,
  logo,
  footer,
}: {
  children: ReactNode;
  title: string;
  hint?: string | null;
  /** The organization's logo; the default mark otherwise. */
  logo?: { server: string; image: string | null };
  /** Pinned to the bottom of the screen, below the form. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={24}
        className="flex-1"
        contentContainerClassName="grow justify-center px-6"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: footer ? 24 : insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View className="w-full max-w-sm self-center">
          <OrgAvatar logo={logo} />
          <Typography.Heading type="h2" align="center" className="mt-6">
            {title}
          </Typography.Heading>
          {!!hint && (
            <Typography.Paragraph color="muted" align="center" className="mt-2">
              {hint}
            </Typography.Paragraph>
          )}
          <View className="mt-8">{children}</View>
        </View>
      </KeyboardAwareScrollView>
      {!!footer && (
        <View className="px-6" style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="w-full max-w-sm self-center">{footer}</View>
        </View>
      )}
    </View>
  );
}

/** The organization's logo (Settings › Organization) in HeroUI's Avatar; the default mark (the bean) as its fallback. */
function OrgAvatar({ logo }: { logo?: { server: string; image: string | null } }) {
  return (
    <Avatar size="lg" variant="soft" color="default" alt="" className="size-18 self-center">
      {!!logo?.image && <Avatar.Image source={{ uri: `${logo.server}${logo.image}` }} />}
      <Avatar.Fallback>
        <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} size={56} />
      </Avatar.Fallback>
    </Avatar>
  );
}
