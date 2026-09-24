import { useQuery } from "@tanstack/react-query";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";
import { useMe } from "@/components/server-scope";
import { haptic } from "@/lib/haptics";
import { useInboxUnread } from "@/lib/inbox";
import { defineMessages } from "@/lib/i18n";
import { conversationsQuery, tasksQuery } from "@/lib/queries";

const t = defineMessages({
  // Short labels: the tab bar gives each one about a fifth of the width.
  en: { chats: "Chats", inbox: "Inbox", tasks: "Tasks", profile: "Profile", search: "Search" },
  fr: { chats: "Discussions", inbox: "Réception", tasks: "Tâches", profile: "Profil", search: "Rechercher" },
});

/** The app's sections, in a native tab bar (liquid glass on iOS 26), with the house icons (assets/tab-icons, drawn from @/components/icons). */
export default function TabsLayout() {
  const me = useMe();
  const unread = useQuery({ ...conversationsQuery, select: (list) => list.filter((c) => c.unread).length }).data ?? 0;
  // Badge: what you have to do yourself, not what you gave to others.
  const openTasks =
    useQuery({ ...tasksQuery(me.id), select: (list) => list.filter((x) => x.status !== "done" && x.assignees.some((a) => a.id === me.id)).length }).data ?? 0;
  const unreadInbox = useInboxUnread();
  // Selected tab in the text color: the web's palette is monochrome.
  const tint = useCSSVariable("--color-foreground") as string;
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={tint} screenListeners={{ tabPress: () => haptic.select() }}>
      <NativeTabs.Trigger name="(chats)">
        <NativeTabs.Trigger.Icon src={require("../../../../assets/tab-icons/chats.png")} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t.chats}</NativeTabs.Trigger.Label>
        {unread > 0 && <NativeTabs.Trigger.Badge>{String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      {/* The web sidebar's Inbox, next to the tasks, with its unread count. */}
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon src={require("../../../../assets/tab-icons/inbox.png")} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t.inbox}</NativeTabs.Trigger.Label>
        {unreadInbox > 0 && <NativeTabs.Trigger.Badge>{String(unreadInbox)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <NativeTabs.Trigger.Icon src={require("../../../../assets/tab-icons/tasks.png")} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t.tasks}</NativeTabs.Trigger.Label>
        {openTasks > 0 && <NativeTabs.Trigger.Badge>{String(openTasks)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon src={require("../../../../assets/tab-icons/profile.png")} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t.profile}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(search)" role="search">
        <NativeTabs.Trigger.Icon src={require("../../../../assets/tab-icons/search.png")} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t.search}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
