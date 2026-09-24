import type { IntegrationType } from "@agora/core";
import { Circle, Path, Rect } from "react-native-svg";
import { circle, createIcon, Hole, type IconComponent, type IconProps } from "./create-icon";

// apps/web/src/components/icons/integrations.tsx, same paths.
// Integration types (@agora/core integrations): what a connector gives access to,
// whatever the provider. One object per type, solid with its details hollowed out,
// so the family reads as a set in the marketplace and on the views' header tile.

export const MailIntegrationIcon = createIcon("mail-integration", {
  fill: <Rect x="2" y="5" width="19" height="15" rx="4.5" />,
  cut: (
    <>
      <Path d="M6 10l4.4 3a2.8 2.8 0 0 0 3.2 0L18 10" />
      <Hole d={circle(19.5, 5.5, 4.4)} />
    </>
  ),
  solid: <Circle cx="19.5" cy="5.5" r="2.9" />,
});

export const CalendarIntegrationIcon = createIcon("calendar-integration", {
  fill: <Rect x="3" y="4.5" width="18" height="16.5" rx="4.5" />,
  cut: (
    <>
      <Path d="M8 2.5v4M16 2.5v4" strokeWidth="4.5" />
      <Path d="M3 10h18" />
      {[
        [8, 14],
        [12, 14],
        [16, 14],
        [8, 17.5],
        [12, 17.5],
      ].map(([x, y]) => (
        <Hole key={`${x}-${y}`} d={circle(x!, y!, 1.2)} />
      ))}
    </>
  ),
  line: <Path d="M8 2.5v4M16 2.5v4" />,
});

export const ChatIntegrationIcon = createIcon("chat-integration", {
  fill: <Path d="M12 3c5 0 9 3.4 9 7.7s-4 7.8-9 7.8c-1 0-2-.1-2.9-.4L5.2 20.6a.8.8 0 0 1-1.2-.9l.9-3.2C3.7 15 3 13 3 10.7 3 6.4 7 3 12 3z" />,
  cut: (
    <>
      <Hole d={circle(8, 10.8, 1.3)} />
      <Hole d={circle(12, 10.8, 1.3)} />
      <Hole d={circle(16, 10.8, 1.3)} />
    </>
  ),
});

export const TasksIntegrationIcon = createIcon("tasks-integration", {
  fill: <Rect x="3" y="3" width="18" height="18" rx="5" />,
  cut: <Path d="M7 8.8l1.6 1.6 2.9-2.9M14 9.2h3M7 15.3l1.6 1.6 2.9-2.9M14 15.7h3" />,
});

export const FilesIntegrationIcon = createIcon("files-integration", {
  fill: <Rect x="3" y="6.5" width="13.5" height="15" rx="3.5" />,
  cut: <Path d="M6.5 12.5h6.5M6.5 16h4" />,
  line: <Path d="M8 3h8.5A3.5 3.5 0 0 1 20 6.5V16" />,
});

export const ContactsIntegrationIcon = createIcon("contacts-integration", {
  fill: <Rect x="2" y="4.5" width="20" height="15" rx="4" />,
  cut: (
    <>
      <Hole d={circle(8.5, 10.5, 2.2)} />
      <Path d="M5.5 15.8c.6-1.3 1.7-2.1 3-2.1s2.4.8 3 2.1M14.5 10h4M14.5 13.5h2.5" />
    </>
  ),
});

export const FinanceIntegrationIcon = createIcon("finance-integration", {
  fill: <Path d="M6.5 2.5h11A2.5 2.5 0 0 1 20 5v15.3a.7.7 0 0 1-1 .6l-2-1.1-2.2 1.2a1.2 1.2 0 0 1-1.1 0L12 19.8 10.3 21a1.2 1.2 0 0 1-1.1 0L7 19.8l-2 1.1a.7.7 0 0 1-1-.6V5a2.5 2.5 0 0 1 2.5-2.5z" />,
  cut: <Path d="M8 7.5h8M8 11h8M8 14.5h4.5" />,
});

export const CodeIntegrationIcon = createIcon("code-integration", {
  fill: <Rect x="2.5" y="3.5" width="19" height="17" rx="4.5" />,
  cut: <Path d="M9.5 9l-3 3 3 3M14.5 9l3 3-3 3" />,
});

export const DatabaseIntegrationIcon = createIcon("database-integration", {
  fill: <Path d="M4 6c0-1.9 3.6-3.5 8-3.5s8 1.6 8 3.5v12c0 1.9-3.6 3.5-8 3.5s-8-1.6-8-3.5z" />,
  cut: <Path d="M4 6.2c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5M4 12.2c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" />,
});

export const OtherIntegrationIcon = createIcon("other-integration", {
  solid: (
    <>
      <Rect x="3" y="3" width="8" height="8" rx="2.5" />
      <Rect x="13" y="3" width="8" height="8" rx="2.5" />
      <Rect x="3" y="13" width="8" height="8" rx="2.5" />
      <Circle cx="17" cy="17" r="4" />
    </>
  ),
});

const icons: Record<IntegrationType, IconComponent> = {
  mail: MailIntegrationIcon,
  calendar: CalendarIntegrationIcon,
  chat: ChatIntegrationIcon,
  tasks: TasksIntegrationIcon,
  files: FilesIntegrationIcon,
  contacts: ContactsIntegrationIcon,
  finance: FinanceIntegrationIcon,
  code: CodeIntegrationIcon,
  database: DatabaseIntegrationIcon,
  other: OtherIntegrationIcon,
};

export const integrationIcon = (type: IntegrationType | null | undefined): IconComponent => icons[type ?? "other"] ?? OtherIntegrationIcon;

export function IntegrationIcon({ type, ...props }: IconProps & { type: IntegrationType | null | undefined }) {
  const Icon = icons[type ?? "other"] ?? OtherIntegrationIcon;
  return <Icon {...props} />;
}
