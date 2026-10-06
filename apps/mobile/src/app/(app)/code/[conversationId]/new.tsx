import { CODE_PERMISSION_MODES, type CodePermissionMode } from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Description, FieldError, Label, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { codeSessionHref } from "@/components/code-session";
import { AttachMenu } from "@/components/composer/attach-menu";
import { PendingFiles, usePendingFiles } from "@/components/composer/pending-files";
import { headerIcon } from "@/components/header-button";
import { OptionPicker } from "@/components/menus";
import { applyCodeSession, codeModelsQuery, codeReposQuery, codeSessionsQuery, startCodeSession } from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/*
 * NewSessionView of apps/web/src/components/CodeSession.tsx, as a form sheet: the first instruction
 * starts the session, in the repository, the mode and the model chosen here, and Claude Code names
 * it from there. Its owner only (the conversation's menu offers it to them alone).
 */

const NO_REPO = "";

export default function NewCodeSessionSheet() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  const { data: repos = [] } = useQuery(codeReposQuery(conversationId));
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId));
  // The conversation's repositories, the latest session's first: usually the one to work on again.
  const recent = [...new Set([...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap((s) => (s.git?.repo ? [s.git.repo] : [])))];
  const [repo, setRepo] = useState<string>(recent[0] ?? NO_REPO);
  const [mode, setMode] = useState<CodePermissionMode>("bypassPermissions");
  const [model, setModel] = useState<string>("");
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const { files, setFiles, addFiles, removeFile } = usePendingFiles(conversationId, t);
  const ids = files.flatMap((f) => (f.status === "ready" && f.attachment ? [f.attachment.id] : []));

  const start = useMutation({
    mutationFn: () => startCodeSession(conversationId, { task: text.trim(), attachmentIds: ids, mode, ...(repo && { repo }), ...(model && { model }) }),
    // The sheet gives way to the session; a failure stays inline, in the sheet.
    onSuccess: (s) => {
      setFiles([]);
      applyCodeSession(qc, s);
      router.back();
      router.push(codeSessionHref(conversationId, s.id));
    },
  });
  const ready = !start.isPending && !files.some((f) => f.status === "uploading") && (!!text.trim() || ids.length > 0);

  const repoOptions = [
    { value: NO_REPO, label: t.noRepo },
    ...recent.map((r) => ({ value: r, label: r })),
    ...repos.filter((r) => !recent.includes(r.repo)).map((r) => ({ value: r.repo, label: r.repo })),
  ];

  return (
    <>
      <Stack.Screen options={{ title: t.newSession }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={start.isPending ? t.empty : t.send}
          disabled={!ready}
          variant="prominent"
          onPress={withTap(() => start.mutate())}
        />
      </Stack.Toolbar>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 p-4 pb-12"
      >
        <Description className="px-4">{t.newHint}</Description>
        <TextField isRequired>
          <Label>{t.instruction}</Label>
          <TextArea value={text} onChangeText={setText} placeholder={t.placeholderNew("Claude Code")} autoFocus />
          <View className="flex-row items-center gap-2">
            <AttachMenu open={attachOpen} onOpenChange={setAttachOpen} onFiles={addFiles} />
            <PendingFiles items={files} onRemove={removeFile} />
          </View>
        </TextField>
        <TextField>
          <Label>{t.repo}</Label>
          <OptionPicker value={repo} options={repoOptions} onChange={setRepo} label={t.repo} />
        </TextField>
        <TextField>
          <Label>{t.mode}</Label>
          <OptionPicker value={mode} options={CODE_PERMISSION_MODES.map((m) => ({ value: m, label: t.modes[m] }))} onChange={setMode} label={t.mode} />
          <Description>{t.modeHelp[mode]}</Description>
        </TextField>
        {models.length > 0 && (
          <TextField>
            <Label>{t.model}</Label>
            <OptionPicker value={model} options={models.map((m) => ({ value: m.id, label: m.label ?? m.id }))} onChange={setModel} label={t.model} />
          </TextField>
        )}
        <FieldError isInvalid={!!start.error}>{start.error?.message}</FieldError>
      </KeyboardAwareScrollView>
    </>
  );
}
