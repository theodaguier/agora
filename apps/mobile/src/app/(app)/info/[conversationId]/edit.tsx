import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Avatar, LinkButton } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { ErrorAlert, FormField, FormInput, LoadingRows, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { headerIcon } from "@/components/header-button";
import { TapMenu, type MenuEntry } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { uploadImage } from "@/lib/admin";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { conversationQuery, conversationsQuery } from "@/lib/queries";
import type { ConversationDetail } from "@/lib/types";

/* EditProject of apps/web/src/components/MembersPanel.tsx; the logo as the organization's (profile/admin/organization.tsx). */

const messages = defineMessages({
  en: {
    title: "Edit the project",
    logo: "Logo",
    changeLogo: "Change the logo",
    choosePhoto: "Choose a photo",
    takePhoto: "Take a photo",
    removeLogo: "Remove the logo",
    name: "Project name",
    nameRequired: "The project needs a name.",
    description: "Description",
    descriptionHelp: "One line: what the project is about.",
    saveFailed: "Couldn't save.",
  },
  fr: {
    title: "Modifier le projet",
    logo: "Logo",
    changeLogo: "Changer le logo",
    choosePhoto: "Choisir une photo",
    takePhoto: "Prendre une photo",
    removeLogo: "Retirer le logo",
    name: "Nom du projet",
    nameRequired: "Le projet a besoin d'un nom.",
    description: "Description",
    descriptionHelp: "Une ligne : de quoi parle le projet.",
    saveFailed: "Enregistrement impossible.",
  },
});

/** A new logo picked on the phone, removed (null), or unchanged (undefined). */
type LogoChange = { uri: string; mime: string } | null | undefined;

/** The project's logo, name and description, saved together by the header's check. */
export default function EditProject() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { data: conv, error, refetch } = useQuery(conversationQuery(conversationId));
  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      {conv ? (
        <ProjectForm key={conv.id} conv={conv} />
      ) : (
        <SettingsScroll onRefresh={refetch}>{error ? <ErrorAlert error={error} /> : <LoadingRows rows={2} avatar={false} />}</SettingsScroll>
      )}
    </>
  );
}

function ProjectForm({ conv }: { conv: ConversationDetail }) {
  const t = messages;
  const c = tr(common);
  const me = useMe();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [title, setTitle] = useState(conv.title ?? "");
  const [description, setDescription] = useState(conv.description ?? "");
  const [logo, setLogo] = useState<LogoChange>(undefined);

  const save = useMutation({
    mutationFn: async () => {
      await api(conversationPath(conv.id), { method: "PATCH", body: JSON.stringify({ title: title.trim(), description: description.trim() }) });
      if (logo) await uploadImage(conversationPath(conv.id, "/avatar"), logo);
      else if (logo === null) await api(conversationPath(conv.id, "/avatar"), { method: "DELETE" });
    },
    onSuccess: async () => {
      toast.success(c.saved);
      await Promise.all([qc.invalidateQueries({ queryKey: conversationQuery(conv.id).queryKey }), qc.invalidateQueries({ queryKey: conversationsQuery.queryKey })]);
      router.back();
    },
    onError: (e) => toast.failed(e, t.saveFailed),
  });

  const pick = async (camera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5 };
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const res = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setLogo({ uri: asset.uri, mime: asset.mimeType === "image/png" || asset.mimeType === "image/webp" ? asset.mimeType : "image/jpeg" });
  };
  const hasLogo = logo === undefined ? !!conv.image : logo !== null;
  const logoActions: MenuEntry[] = [
    {
      title: t.logo,
      actions: [
        { label: t.choosePhoto, icon: "photo.on.rectangle", onPress: () => pick(false) },
        { label: t.takePhoto, icon: "camera", onPress: () => pick(true) },
      ],
    },
    hasLogo && "divider",
    hasLogo && { label: t.removeLogo, icon: "trash", destructive: true, onPress: () => setLogo(null) },
  ];

  const dirty = title.trim() !== (conv.title ?? "") || description.trim() !== (conv.description ?? "") || logo !== undefined;
  const canSave = dirty && !!title.trim() && !save.isPending;

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? c.saving : c.save}
          disabled={!canSave}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <View className="items-center gap-2">
          <TapMenu actions={logoActions} accessibilityLabel={t.changeLogo}>
            {logo ? (
              <Avatar alt="" variant="soft" color="default" className="size-24">
                <Avatar.Image source={{ uri: logo.uri }} asChild>
                  <Image style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </Avatar.Image>
              </Avatar>
            ) : (
              <ConversationAvatar conversation={{ ...conv, image: logo === null ? null : conv.image }} me={me.id} className="size-24" />
            )}
          </TapMenu>
          <TapMenu actions={logoActions}>
            <LinkButton hitSlop={8}>
              <LinkButton.Label>{t.changeLogo}</LinkButton.Label>
            </LinkButton>
          </TapMenu>
        </View>

        <FormField label={t.name} required invalid={!title.trim()} error={t.nameRequired}>
          <FormInput value={title} maxLength={80} onChangeText={setTitle} returnKeyType="done" />
        </FormField>

        <FormField label={t.description} help={t.descriptionHelp}>
          <FormInput value={description} maxLength={200} onChangeText={setDescription} returnKeyType="done" />
        </FormField>
      </SettingsScroll>
    </>
  );
}
