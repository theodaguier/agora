import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { Avatar, Description, FieldError, Input, Label, LinkButton, ListGroup, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { zoneLabel } from "@/components/profile/timezone";
import { TimeZoneSheet } from "@/components/time-zone-sheet";
import { AdminGate, ErrorAlert, LoadingRows, PressableRow, Section, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { OrgLogo } from "@/components/org-logo";
import { useServer } from "@/components/server-scope";
import { api } from "@/lib/api";
import { adminOrgQuery, uploadImage, type Org } from "@/lib/admin";
import { defineMessages, tr } from "@/lib/i18n";
import { TapMenu, OptionPicker, type MenuEntry } from "@/components/menus";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/OrgSettings.tsx */

const messages = defineMessages({
  en: {
    title: "Organization",
    logo: "Logo",
    changeLogo: "Change the logo",
    choosePhoto: "Choose a photo",
    takePhoto: "Take a photo",
    removeLogo: "Remove the logo",
    name: "Organization name",
    locale: "Default language",
    localeHelp: "Used for the interface and the agents. Members can override it in their settings.",
    timezone: "Time zone",
    searchTimezone: "Search time zones",
    timezoneHelp: "Used for dates in invitation emails and for daily usage stats.",
    nameHelp: "The name appears on the sign-in page, in invitations and in the agents' context.",
    saveFailed: "Couldn't save.",
    nameRequired: "The organization needs a name.",
  },
  fr: {
    title: "Organisation",
    logo: "Logo",
    changeLogo: "Changer le logo",
    choosePhoto: "Choisir une photo",
    takePhoto: "Prendre une photo",
    removeLogo: "Retirer le logo",
    name: "Nom de l'organisation",
    locale: "Langue par défaut",
    localeHelp: "Utilisée pour l'interface et les agents. Chaque membre peut la changer dans ses réglages.",
    timezone: "Fuseau horaire",
    searchTimezone: "Rechercher un fuseau",
    timezoneHelp: "Utilisé pour les dates des e-mails d'invitation et la consommation par jour.",
    nameHelp: "Le nom apparaît à la connexion, dans les invitations et dans le contexte des agents.",
    saveFailed: "Enregistrement impossible.",
    nameRequired: "L'organisation a besoin d'un nom.",
  },
});

/** apps/web/src/lib/languages.ts: language names stay in their own language. */
const languages = [
  { value: "fr", label: "🇫🇷  Français" },
  { value: "en", label: "🇬🇧  English" },
];

/** A new logo picked on the phone, removed (null), or unchanged (undefined). */
type LogoChange = { uri: string; mime: string } | null | undefined;

export default function Organization() {
  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <AdminGate>
        <OrgForm />
      </AdminGate>
    </>
  );
}

function OrgForm() {
  const t = messages;
  const c = tr(common);
  const qc = useQueryClient();
  const server = useServer();
  const toast = useAdminToast();
  const { data, error, refetch } = useQuery(adminOrgQuery);
  const [form, setForm] = useState<Org | null>(null);
  const [logo, setLogo] = useState<LogoChange>(undefined);
  const [zonesOpen, setZonesOpen] = useState(false);
  // Each new load of the organization resets the form.
  const [loadedData, setLoadedData] = useState(data);
  if (data !== loadedData) {
    setLoadedData(data);
    if (data) setForm(data);
  }

  const save = useMutation({
    mutationFn: async ({ name, locale, timezone }: Org) => {
      await api<Org>("/admin/org", { method: "PUT", body: JSON.stringify({ name: name.trim(), locale, timezone }) });
      if (logo) await uploadImage("/admin/org/avatar", logo);
      else if (logo === null) await api("/admin/org/avatar", { method: "DELETE" });
    },
    onSuccess: () => {
      setLogo(undefined);
      toast.success(c.saved);
      qc.invalidateQueries({ queryKey: ["admin", "org"] });
      qc.invalidateQueries({ queryKey: ["org"] });
      qc.invalidateQueries({ queryKey: ["setup"] });
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
  const hasLogo = logo === undefined ? !!data?.image : logo !== null;
  // The HeroUI Menu of the logo and of its link.
  const logoActions: MenuEntry[] = [
    { title: t.logo, actions: [
      { label: t.choosePhoto, icon: "photo.on.rectangle", onPress: () => pick(false) },
      { label: t.takePhoto, icon: "camera", onPress: () => pick(true) },
    ] },
    hasLogo && "divider",
    hasLogo && { label: t.removeLogo, icon: "trash", destructive: true, onPress: () => setLogo(null) },
  ];

  if (!form || !data)
    return (
      <SettingsScroll onRefresh={refetch}>
        {error ? <ErrorAlert error={error} /> : <LoadingRows rows={3} avatar={false} />}
      </SettingsScroll>
    );

  const dirty = JSON.stringify(form) !== JSON.stringify(data) || logo !== undefined;
  const canSave = dirty && !!form.name.trim() && !save.isPending;

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!canSave} variant="prominent" onPress={withTap(() => save.mutate(form))} />
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
              <OrgLogo server={server.url} image={logo === null ? null : data.image} className="size-24" />
            )}
          </TapMenu>
          <TapMenu actions={logoActions}>
            <LinkButton hitSlop={8}>
              <LinkButton.Label>{t.changeLogo}</LinkButton.Label>
            </LinkButton>
          </TapMenu>
        </View>

        <TextField isRequired isInvalid={!form.name.trim()}>
          <Label>{t.name}</Label>
          <Input value={form.name} maxLength={80} onChangeText={(name) => setForm({ ...form, name })} returnKeyType="done" />
          {form.name.trim() ? <Description>{t.nameHelp}</Description> : <FieldError>{t.nameRequired}</FieldError>}
        </TextField>

        <Section footer={t.localeHelp}>
          <ListGroup.Item disabled>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.locale}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix>
              <OptionPicker value={form.locale} options={languages} label={t.locale} onChange={(locale) => setForm({ ...form, locale: locale as "fr" | "en" })} />
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </Section>

        <Section footer={t.timezoneHelp}>
          <PressableRow onPress={() => setZonesOpen(true)}>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.timezone}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>{zoneLabel(form.timezone)}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Section>

      </SettingsScroll>
      <TimeZoneSheet
        isOpen={zonesOpen}
        onOpenChange={setZonesOpen}
        value={form.timezone}
        onChange={(timezone) => setForm({ ...form, timezone })}
        title={t.timezone}
        placeholder={t.searchTimezone}
 />
    </>
  );
}
