import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Description, FieldError, Label, Spinner, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAdminToast } from "@/components/admin/ui";
import { headerIcon } from "@/components/header-button";
import { codeSessionQuery, repoEnvQuery, saveRepoEnv } from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* RepoCredentialsDialog of apps/web/src/components/CodeSession.tsx: the credentials of the session's repository, as a form sheet. */

export default function CredentialsSheet() {
  const { conversationId, sessionId } = useLocalSearchParams<{ conversationId: string; sessionId: string }>();
  const t = tr(codeSessions).credentials;
  const { data: session } = useQuery(codeSessionQuery(conversationId, sessionId));
  const repo = session?.repo ?? null;
  const { data } = useQuery({ ...repoEnvQuery(conversationId, repo ?? ""), enabled: !!repo });
  return (
    <>
      <Stack.Screen options={{ title: repo ? t.title(repo) : t.open }} />
      {repo && data ? <CredentialsForm conversationId={conversationId} repo={repo} initial={data.env} /> : <Spinner className="mt-24 self-center" />}
    </>
  );
}

function CredentialsForm({ conversationId, repo, initial }: { conversationId: string; repo: string; initial: string }) {
  const t = tr(codeSessions).credentials;
  const c = tr(common);
  const router = useRouter();
  const toast = useAdminToast();
  const [text, setText] = useState(initial);
  const save = useMutation({
    mutationFn: () => saveRepoEnv(conversationId, repo, text),
    // The toast shows once the sheet is closed; a failure stays inline, in the sheet.
    onSuccess: () => {
      toast.success(t.saved);
      router.back();
    },
  });
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? c.saving : c.save}
          disabled={save.isPending}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 p-4 pb-12"
      >
        <Description className="px-4">{t.help}</Description>
        <TextField>
          <Label>{t.label}</Label>
          <TextArea
            value={text}
            onChangeText={setText}
            placeholder={t.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            className="min-h-48 max-h-96 font-mono"
          />
        </TextField>
        <FieldError isInvalid={!!save.error}>{save.error?.message}</FieldError>
      </KeyboardAwareScrollView>
    </>
  );
}
