import { Separator, Surface, Typography } from "heroui-native";
import type { ReactNode } from "react";

/*
 * apps/web/src/screens/Sessions.tsx `GroupHeader` and the groups of TaskList's table (Figma
 * « Mes tâches » / « Sessions de code »): a group's band, full width, its mark, its name, its count in
 * grey; a hairline under it, as under each of its rows.
 */
export function ListBand({ mark, label, count }: { mark?: ReactNode; label: string; count: number }) {
  return (
    <>
      <Surface variant="secondary" accessibilityRole="header" className="h-9 flex-row items-center gap-2 rounded-none px-4 py-0 shadow-none">
        {mark}
        <Typography type="body-sm" weight="medium" numberOfLines={1} className="shrink">
          {label}
        </Typography>
        <Typography type="body-sm" className="text-subtle">
          {count}
        </Typography>
      </Surface>
      <Separator />
    </>
  );
}
