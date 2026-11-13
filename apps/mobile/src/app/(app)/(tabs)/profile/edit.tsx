import { auth, common } from "@agora/core/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { Avatar, Button, FieldError, Input, ListGroup, TextArea } from "heroui-native";
import { useState } from "react";
import { PersonAvatar } from "@/components/conversation-avatar";
import { FieldRow, Intro, Section, SettingsRow, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { deleteAvatar, refreshProfile, saveProfile, uploadAvatar, useMeProfile } from "@/components/profile/me";
import { useSignOut } from "@/components/profile/organizations";
import { useServer } from "@/components/server-scope";
import { defineMessages, tr } from "@/lib/i18n";
import { TapMenu, type MenuEntry } from "@/components/menus";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/*
 * apps/web/src/components/Settings.tsx General (Figma « R1 · Réglages — Général »): the profile, then
 * the account, each one group of rows; ProfileFields.tsx `rows`, label on the left and field on the right.
 */

const messages = defineMessages({
  en: {
    title: "General",
    generalHelp: "Your profile, as colleagues and bots see it.",
    profile: "Profile",
    photo: "Profile photo",
    firstName: "First name",
    lastName: "Last name",
    role: "Role",
    rolePlaceholder: "Developer, spouse…",
    username: "Username",
    usernamePlaceholder: "first.last",
    bio: "Bio",
    bioPlaceholder: "A few words about you and what you do here.",
    changePhoto: "Change photo",
    addPhoto: "Add a photo",
    choosePhoto: "Choose a photo",
    takePhoto: "Take a photo",
    removePhoto: "Remove photo",
    usernameHint: "2 to 30 letters, digits, dots or _.",
    profileSaved: "Profile saved.",
    account: "Account",
    email: "Email",
    orgRole: "Role in the organization",
    admin: "Admin",
    member: "Member",
    signOutHere: "Sign out of this device",
  },
  fr: {
    title: "Général",
    generalHelp: "Ton profil, visible par tes collègues et les bots.",
    profile: "Profil",
    photo: "Photo de profil",
    firstName: "Prénom",
    lastName: "Nom",
    role: "Rôle",
    rolePlaceholder: "Développeur, conjoint…",
    username: "Username",
    usernamePlaceholder: "prenom.nom",
    bio: "Bio",
    bioPlaceholder: "Quelques mots sur toi, ce que tu fais ici.",
    changePhoto: "Changer la photo",
    addPhoto: "Ajouter une photo",
    choosePhoto: "Choisir une photo",
    takePhoto: "Prendre une photo",
    removePhoto: "Supprimer la photo",
    usernameHint: "2 à 30 lettres, chiffres, points ou _.",
    profileSaved: "Profil enregistré.",
    account: "Compte",
    email: "E-mail",
    orgRole: "Rôle dans l'organisation",
    admin: "Admin",
    member: "Membre",
    signOutHere: "Se déconnecter de cet appareil",
  },
});

const USERNAME = /^[a-zA-Z0-9._]{2,30}$/;

/** Picked photo, not uploaded yet: `null` = remove the photo, `undefined` = unchanged. */
type PhotoChange = { uri: string; mime: string } | null | undefined;

export default function General() {
  const t = { ...messages, ...tr(common), signOut: tr(auth).signOut };
  const me = useMeProfile();
  const server = useServer();
  const signOut = useSignOut();
  const qc = useQueryClient();
  const saved = {
    firstName: me.firstName ?? "",
    lastName: me.lastName ?? "",
    title: me.title ?? "",
    username: me.username ?? "",
    bio: me.bio ?? "",
  };
  const [form, setForm] = useState(saved);
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
  // The web form's `pattern` on the username.
  const usernameInvalid = !!trimmed.username && !USERNAME.test(trimmed.username);
  const complete = !!(trimmed.firstName && trimmed.lastName && trimmed.title && trimmed.username) && !usernameInvalid;
  // Saved on demand, as the web's: the check only shows once something changed.
  const dirty = photo !== undefined || (Object.keys(form) as (keyof typeof form)[]).some((k) => trimmed[k] !== saved[k]);
  const toast = useAdminToast();

  const save = useMutation({
    mutationFn: async () => {
      await saveProfile(trimmed);
      if (photo) await uploadAvatar(photo);
      else if (photo === null) await deleteAvatar();
    },
    onSuccess: () => {
      setPhoto(undefined);
      setForm(trimmed);
      refreshProfile(qc, me.id);
      toast.success(t.profileSaved);
    },
    onError: (e) => toast.failed(e),
  });

  const shown = photo === null ? null : photo ? photo.uri : me.image;

  const pick = async (source: "library" | "camera") => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
  };

  // The HeroUI Menu of the photo row.
  const photoActions: MenuEntry[] = [
    { label: t.choosePhoto, icon: "photo.on.rectangle", onPress: () => pick("library") },
    { label: t.takePhoto, icon: "camera", onPress: () => pick("camera") },
    !!shown && "divider",
    !!shown && { label: t.removePhoto, icon: "trash", destructive: true, onPress: () => setPhoto(me.image ? null : undefined) },
  ];

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? t.saving : t.save}
          hidden={!dirty}
          disabled={!complete || save.isPending}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.generalHelp}</Intro>

        <Section title={t.profile}>
          {/* The photo: a tap on the row opens its HeroUI Menu; the button is part of the trigger. */}
          <TapMenu actions={photoActions} accessibilityLabel={shown ? t.changePhoto : t.addPhoto}>
            <ListGroup.Item pointerEvents="none">
              <ListGroup.ItemPrefix>
                {photo ? (
                  <Avatar alt={me.name} variant="soft" color="default" className="size-12">
                    <Avatar.Image source={{ uri: photo.uri }} />
                    <Avatar.Fallback />
                  </Avatar>
                ) : (
                  <PersonAvatar person={{ id: me.id, name: me.name || "?", image: shown ?? null }} size={48} />
                )}
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t.photo}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <Button size="sm" variant="secondary" pointerEvents="none" accessible={false}>
                {shown ? t.changePhoto : t.addPhoto}
              </Button>
            </ListGroup.Item>
          </TapMenu>
          <FieldRow label={t.firstName} required>
            <Input variant="secondary" value={form.firstName} onChangeText={set("firstName")} maxLength={60} autoComplete="given-name" textContentType="givenName" />
          </FieldRow>
          <FieldRow label={t.lastName} required>
            <Input variant="secondary" value={form.lastName} onChangeText={set("lastName")} maxLength={60} autoComplete="family-name" textContentType="familyName" />
          </FieldRow>
          <FieldRow label={t.role} required>
            <Input variant="secondary" value={form.title} onChangeText={set("title")} maxLength={60} placeholder={t.rolePlaceholder} textContentType="jobTitle" />
          </FieldRow>
          <FieldRow label={t.username} required invalid={usernameInvalid}>
            <Input
              variant="secondary"
              value={form.username}
              onChangeText={set("username")}
              maxLength={30}
              placeholder={t.usernamePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="username"
            />
            <FieldError>{t.usernameHint}</FieldError>
          </FieldRow>
          <FieldRow label={t.bio} top>
            <TextArea variant="secondary" value={form.bio} onChangeText={set("bio")} maxLength={500} placeholder={t.bioPlaceholder} className="min-h-20" />
          </FieldRow>
        </Section>

        <Section title={t.account}>
          <SettingsRow label={t.email} value={me.email} />
          <SettingsRow label={t.orgRole} value={me.role === "admin" ? t.admin : t.member} />
          <SettingsRow label={t.signOutHere}>
            <Button size="sm" variant="outline" onPress={withTap(() => signOut(server))}>
              {t.signOut}
            </Button>
          </SettingsRow>
        </Section>
      </SettingsScroll>
    </>
  );
}
