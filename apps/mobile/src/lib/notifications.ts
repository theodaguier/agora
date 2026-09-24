import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { api } from "./api";
import { taskHref } from "./tasks";

/*
 * Push notifications: the phone's Expo push token is sent to the organization's server
 * (PUT /mobile/push-token, kept on this phone's pairing), which pushes direct messages,
 * mentions, replies, tasks and the morning recap. A tap opens the conversation, the task or the recap.
 */

type PushData = { conversationId?: string | null; messageId?: string | null; taskId?: string | null; digestId?: string };

// While the app is open, the conversation is already on screen or its badge updates live:
// a banner only, no sound. The recap opens by itself there (components/announcements.tsx): nothing.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = !(n.request.content.data as PushData | undefined)?.digestId;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
  },
});

function open(data: PushData | undefined, pathname: string) {
  // Already on screen when it opened by itself at launch.
  if (data?.digestId) {
    if (pathname !== "/digest") router.push("/digest");
  } else if (data?.conversationId)
    router.push({ pathname: "/c/[conversationId]", params: { conversationId: data.conversationId, ...(data.messageId ? { m: data.messageId } : {}) } });
  else if (data?.taskId) router.push(taskHref(data.taskId));
}

/** The Expo push token of this phone, or null (simulator, permission refused, no EAS project). */
async function pushToken(ask: boolean) {
  // Asked on a simulator too: the permission exists there, only the token does not.
  let { status } = await Notifications.getPermissionsAsync();
  if (status === "undetermined" && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted" || !Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Messages", importance: Notifications.AndroidImportance.HIGH });
  }
  // Push tokens are issued for an EAS project (`eas init` writes its id into app.json).
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Sends this phone's token (or null) to the current organization. */
export async function syncPushToken(ask = false) {
  const token = await pushToken(ask);
  await api("/mobile/push-token", { method: "PUT", body: JSON.stringify({ token }) }).catch(() => {});
  return token;
}

/** Notification permission, for the Profile row. */
export const notificationStatus = async () => (await Notifications.getPermissionsAsync()).status;

/**
 * Registers the phone for push once signed in (asking the first time), again when the app comes
 * back (permission changed in Settings), and opens what a tapped notification points to.
 */
export function usePushNotifications() {
  const last = Notifications.useLastNotificationResponse();
  const pathname = useRef("");
  pathname.current = usePathname();
  useEffect(() => {
    if (last?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) open(last.notification.request.content.data as PushData, pathname.current);
  }, [last]);

  useEffect(() => {
    syncPushToken(true);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncPushToken();
        // What was pushed is now read in the app: the icon's badge is cleared.
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);
}
