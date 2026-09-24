import { common } from "@agora/core/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { Avatar, Description, FieldError, Input, Label, LinkButton, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { PersonAvatar } from "@/components/conversation-avatar";
import { deleteAvatar, refreshProfile, saveProfile, uploadAvatar, useMeProfile } from "@/components/profile/me";
import { useFeedback } from "@/components/profile/settings";
import { defineMessages, tr } from "@/lib/i18n";
import { TapMenu, type MenuEntry } from "@/components/menus";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/Settings.tsx ProfileEditor, with ProfileFields.tsx's fields and wording. */

const messages = defineMessages({
  en: {
    title: "Edit profile",
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
    bioCount: (n: number) => `${n}/500`,
    profileSaved: "Profile saved",
  },
  fr: {
    title: "Modifier le profil",
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
    bioCount: (n: number) => `${n}/500`,
    profileSaved: "Profil enregistré",
  },
});

const USERNAME = /^[a-zA-Z0-9._]{2,30}$/;

/** Picked photo, not uploaded yet: `null` = remove the photo, `undefined` = unchanged. */
type PhotoChange = { uri: string; mime: string } | null | undefined;

export default function EditProfile() {
  const t = { ...messages, ...tr(common) };
  const me = useMeProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: me.firstName ?? "",
    lastName: me.lastName ?? "",
    title: me.title ?? "",
    username: me.username ?? "",
    bio: me.bio ?? "",
  });
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
  // The web form's `pattern` on the username.
  const usernameInvalid = !!trimmed.username && !USERNAME.test(trimmed.username);
  const complete = !!(trimmed.firstName && trimmed.lastName && trimmed.title && trimmed.username) && !usernameInvalid;
  const feedback = useFeedback();

  const save = useMutation({
    mutationFn: async () => {
      await saveProfile(trimmed);
      if (photo) await uploadAvatar(photo);
      else if (photo === null) await deleteAvatar();
    },
    onSuccess: () => {
      refreshProfile(qc, me.id);
      feedback.saved(t.profileSaved);
      router.back();
    },
    onError: feedback.failed,
  });

  const shown = photo === null ? null : photo ? photo.uri : me.image;

  const pick = async (source: "library" | "camera") => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
  };

  // The HeroUI Menu of the photo and of its link.
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
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? t.saving : t.save} disabled={!complete || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 px-4 pb-12 pt-4"
      >
        {/* The photo: a HeroUI Avatar; a tap on it or on its link opens its HeroUI Menu (TapMenu, a PressableFeedback). */}
        <TapMenu actions={photoActions} accessibilityLabel={shown ? t.changePhoto : t.addPhoto}>
          <View className="items-center gap-2">
            {photo ? (
              <Avatar alt={me.name} size="lg" variant="soft" color="default" className="size-28">
                <Avatar.Image source={{ uri: photo.uri }} />
                <Avatar.Fallback />
              </Avatar>
            ) : (
              <PersonAvatar person={{ id: me.id, name: me.name || "?", image: shown ?? null }} size={112} />
            )}
            {/* Part of the menu's trigger: the link itself takes no touch. */}
            <LinkButton pointerEvents="none" accessible={false}>
              <LinkButton.Label className="text-link">{shown ? t.changePhoto : t.addPhoto}</LinkButton.Label>
            </LinkButton>
          </View>
        </TapMenu>

        <View className="gap-4">
          <TextField isRequired>
            <Label>{t.firstName}</Label>
            <Input value={form.firstName} onChangeText={set("firstName")} maxLength={60} autoComplete="given-name" textContentType="givenName" />
          </TextField>
          <TextField isRequired>
            <Label>{t.lastName}</Label>
            <Input value={form.lastName} onChangeText={set("lastName")} maxLength={60} autoComplete="family-name" textContentType="familyName" />
          </TextField>
          <TextField isRequired>
            <Label>{t.role}</Label>
            <Input value={form.title} onChangeText={set("title")} maxLength={60} placeholder={t.rolePlaceholder} textContentType="jobTitle" />
          </TextField>
          <TextField isRequired isInvalid={usernameInvalid}>
            <Label>{t.username}</Label>
            <Input
              value={form.username}
              onChangeText={set("username")}
              maxLength={30}
              placeholder={t.usernamePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="username"
            />
            <Description hideOnInvalid>{t.usernameHint}</Description>
            <FieldError>{t.usernameHint}</FieldError>
          </TextField>
          <TextField>
            <Label>{t.bio}</Label>
            <TextArea value={form.bio} onChangeText={set("bio")} maxLength={500} placeholder={t.bioPlaceholder} className="min-h-24" />
            <Description>{t.bioCount(form.bio.length)}</Description>
          </TextField>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
