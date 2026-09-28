import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Description, FieldError, Input, Label, Spinner, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAdminToast } from "@/components/admin/ui";
import { headerIcon } from "@/components/header-button";
import { applyCodeSession, codeSessionQuery, runCodeGit } from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* PullRequestDialog of apps/web/src/components/CodeSession.tsx: the session's pull request, as a form sheet. */

export default function PullRequestSheet() {
  const { conversationId, sessionId } = useLocalSearchParams<{ conversationId: string; sessionId: string }>();
  const t = tr(codeSessions).git;
  const { data: session } = useQuery(codeSessionQuery(conversationId, sessionId));
  return (
    <>
      <Stack.Screen options={{ title: t.prTitle }} />
      {session?.git ? (
        <PullRequestForm
          conversationId={conversationId}
          sessionId={sessionId}
          branch={session.git.branch ?? ""}
          base={session.git.base ?? ""}
          defaultTitle={session.git.ahead === 1 && session.git.lastCommit ? session.git.lastCommit.subject : session.title}
          defaultBody={session.result ?? ""}
        />
      ) : (
        <Spinner className="mt-24 self-center" />
      )}
    </>
  );
}

function PullRequestForm(props: { conversationId: string; sessionId: string; branch: string; base: string; defaultTitle: string; defaultBody: string }) {
  const t = tr(codeSessions).git;
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const [title, setTitle] = useState(props.defaultTitle);
  const [body, setBody] = useState(props.defaultBody);
  const open = useMutation({
    mutationFn: () => runCodeGit(props.conversationId, props.sessionId, { action: "pr", title: title.trim(), body, draft: false }),
    // The toast shows once the sheet is closed; a failure stays inline, in the sheet.
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.opened);
      router.back();
    },
  });
  const ready = !!title.trim() && !open.isPending;
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={open.isPending ? c.inProgress : t.openPr}
          disabled={!ready}
          variant="prominent"
          onPress={withTap(() => open.mutate())}
        />
      </Stack.Toolbar>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 p-4 pb-12"
      >
        <Description className="px-4">{t.prHelp(props.branch, props.base)}</Description>
        <TextField isRequired>
          <Label>{t.title}</Label>
          <Input value={title} onChangeText={setTitle} autoFocus />
        </TextField>
        <TextField>
          <Label>{t.body}</Label>
          <TextArea value={body} onChangeText={setBody} className="max-h-72" />
        </TextField>
        <FieldError isInvalid={!!open.error}>{open.error?.message}</FieldError>
      </KeyboardAwareScrollView>
    </>
  );
}
