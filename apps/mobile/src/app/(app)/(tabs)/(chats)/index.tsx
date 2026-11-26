import { common, conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Spinner } from "heroui-native";
import { View } from "react-native";
import { DrawerButton } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { WarningIcon } from "@/components/icons";
import { SimpleHome } from "@/components/simple/home";
import { tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import { useSimple } from "@/lib/simple";
import { Conversation } from "@/screens/conversation";

/*
 * Figma « Mobile — ChatGPT 1:1 (26 nov.) »: the home is a conversation, as ChatGPT's. The drawer picks
 * which one (`?c=`); without one, the latest. The simple interface keeps its own home (a chat with its
 * assistant, components/simple).
 */
export default function Home() {
  return useSimple() ? <SimpleHome /> : <FullHome />;
}

function FullHome() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const { data: list, error, refetch } = useQuery(conversationsQuery);
  // The latest conversation still in use: its activity sorts the list (projects' discussions included).
  const latest = list?.filter((x) => !x.archived).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())[0];
  const id = c ?? latest?.id;
  if (id) return <Conversation key={id} conversationId={id} home />;
  const t = tr(conversations);
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <DrawerButton />
      <View className="flex-1 items-center justify-center bg-background">
        {error ? (
          <EmptyState icon={WarningIcon} description={tr(common).unknownError} action={{ label: tr(common).retry, onPress: () => refetch() }} />
        ) : list ? (
          // Nothing yet: say so, and offer the first conversation (Figma « État vide », Grand).
          <EmptyState mascot="violet" title={t.empty} action={{ label: t.newConversation, onPress: () => router.push("/new") }} />
        ) : (
          <Spinner />
        )}
      </View>
    </>
  );
}
