import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { Typography } from "heroui-native";
import { useEffect, useState, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useResolveClassNames } from "uniwind";

/*
 * apps/web/src/components/ai-elements/shimmer.tsx: what is being done right now, a light passing over
 * the words. The HeroUI Typography is the mask; under it, the muted text colour and a brighter band
 * sliding across (HeroUI has no shimmering text of its own).
 */

type TypographyType = ComponentProps<typeof Typography>["type"];

export function Shimmer({ children, type = "body-sm", numberOfLines }: { children: string; type?: TypographyType; numberOfLines?: number }) {
  const muted = (useResolveClassNames("text-muted") as { color?: string }).color ?? "#888";
  const bright = (useResolveClassNames("text-foreground") as { color?: string }).color ?? "#111";
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!width) return;
    x.set(-width);
    x.set(withRepeat(withTiming(width, { duration: 1800, easing: Easing.linear }), -1, false));
  }, [width, x]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const text = (
    <Typography type={type} numberOfLines={numberOfLines}>
      {children}
    </Typography>
  );
  return (
    <MaskedView maskElement={text} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={children}>
      {/* Sized by the words themselves, drawn by the colours under them. */}
      <View style={{ backgroundColor: muted }}>
        <View style={{ opacity: 0 }}>{text}</View>
        <Animated.View style={[StyleSheet.absoluteFill, band]}>
          <LinearGradient colors={[muted, bright, muted]} locations={[0.3, 0.5, 0.7]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </MaskedView>
  );
}
