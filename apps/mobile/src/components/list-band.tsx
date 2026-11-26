import { Typography } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

/*
 * Figma « Mobile — ChatGPT 1:1 », « Mes tâches » and « Sessions de code »: a group's heading in a flat
 * list, small grey words and the group's count, no band; its rows carry their own state and priority.
 * `mark`: only what the rows don't say (a project's repository logo).
 */
export function ListBand({ mark, label, count }: { mark?: ReactNode; label: string; count: number }) {
  return (
    <View accessibilityRole="header" className="flex-row items-center gap-1.5 px-[22px] pb-1.5 pt-5">
      {mark}
      <Typography numberOfLines={1} className="shrink text-footnote font-semibold text-muted">
        {label}
      </Typography>
      <Typography className="text-footnote text-subtle">{count}</Typography>
    </View>
  );
}
