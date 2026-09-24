import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Avatar, Button, Input, InputGroup, Label, LinkButton, Spinner, TextArea, TextField } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AuthLinkStep } from "@/components/auth-link-step";
import { AuthScreen } from "@/components/auth-screen";
import { LoginField } from "@/components/login-field";
import { Marble } from "@/components/marble";
import { ApiError, findOrg, signIn, type Org } from "@/lib/api";
import { publicRequest, readAuthParams } from "@/lib/auth-links";
import { readLocalFile } from "@/lib/files";
import { withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { useServers } from "@/lib/servers";
import { AtIcon, LockIcon, MailIcon } from "@/components/icons";
import { TapMenu, type MenuEntry } from "@/components/menus";

/* apps/web/src/screens/Invite.tsx (with ProfileFields.tsx's fields), on the instance named by the link. */

const messages = defineMessages({
  en: {
    unreachable: "Server unreachable",
    unreachableHint: "Your invitation isn't the problem. Try again in a moment.",
    retrying: "Retrying…",
    unavailable: "Invitation unavailable",
    goToLogin: "Go to sign in",
    mismatch: "The two passwords don't match.",
    createFailed: "Couldn't create the account.",
    welcome: (org: string) => `Welcome to ${org}`,
    hint: "Create your profile and choose your password.",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "10 characters min.",
    confirm: "Confirm password",
    creating: "Creating account…",
    create: "Create my account",
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
  },
  fr: {
    unreachable: "Serveur injoignable",
    unreachableHint: "Ton invitation n'est pas en cause. Réessaie dans un instant.",
    retrying: "Nouvel essai…",
    unavailable: "Invitation indisponible",
    goToLogin: "Aller à la connexion",
    mismatch: "Les deux mots de passe ne correspondent pas.",
    createFailed: "Création du compte impossible.",
    welcome: (org: string) => `Bienvenue sur ${org}`,
    hint: "Crée ton profil et choisis ton mot de passe.",
    email: "Email",
    password: "Mot de passe",
    passwordPlaceholder: "10 caractères min.",
    confirm: "Confirmation",
    creating: "Création du compte…",
    create: "Créer mon compte",
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
  },
});

type Photo = { uri: string; mime: string };
type Loaded = { org: Org; email: string };

/** 4xx: invalid, expired or already used link. Everything else (network, 5xx, proxy) is transient. */
const isDefinitive = (err: unknown) => err instanceof ApiError && err.status >= 400 && err.status < 500;

/**
 * The invitation link received by email (`agora://invite?server=…&token=…`, or pasted): the invitee
 * completes their profile and picks a password, then this phone is signed in to the instance.
 */
export default function Invite() {
  const params = useLocalSearchParams<{ server?: string; token?: string }>();
  const link = readAuthParams(params);
  if (!link) return <AuthLinkStep kind="invite" />;
  return <Invitation key={`${link.server}#${link.token}`} server={link.server} token={link.token} />;
}

function Invitation({ server, token }: { server: string; token: string }) {
  const t = { ...messages, retry: tr(common).retry, cancel: tr(common).cancel };
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by "Retry": runs the effect again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([findOrg(server), publicRequest<{ email: string }>(server, `/invitations/${encodeURIComponent(token)}`)])
      .then(
        ([org, invitation]) => {
          if (cancelled) return;
          setLoaded({ org, email: invitation.email });
          setLoadError(null);
        },
        (err) => !cancelled && setLoadError(err),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [server, token, attempt]);

  const load = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  if (loaded) return <InvitationForm server={server} token={token} {...loaded} />;
  if (!loadError)
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="lg" />
      </View>
    );
  if (!isDefinitive(loadError))
    return (
      <AuthScreen title={t.unreachable} hint={t.unreachableHint} logo={{ server, image: null }}>
        <Button size="lg" variant="secondary" isDisabled={loading} onPress={withTap(load)} className="w-full">
          {loading ? t.retrying : t.retry}
        </Button>
      </AuthScreen>
    );
  return (
    <AuthScreen title={t.unavailable} hint={loadError instanceof Error ? loadError.message : null} logo={{ server, image: null }}>
      <Button size="lg" variant="secondary" onPress={withTap(() => goToLogin(server))} className="w-full">
        {t.goToLogin}
      </Button>
    </AuthScreen>
  );
}

function InvitationForm({ server, token, org, email }: { server: string; token: string } & Loaded) {
  const t = messages;
  const { save } = useServers();
  const [form, setForm] = useState({ firstName: "", lastName: "", title: "", username: "", bio: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  // The mismatch under the confirmation; the server's refusals above the button.
  const [error, setError] = useState<{ message: string; on: "confirm" | "form" } | null>(null);
  const [pending, setPending] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
  // Required as on the web, where the browser stops the form.
  const complete = !!(trimmed.firstName && trimmed.lastName && trimmed.title && trimmed.username && password && confirm);
  const name = `${trimmed.firstName} ${trimmed.lastName}`.trim();

  const pick = async (source: "library" | "camera") => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
  };

  // The photo's choices, from the avatar or the link under it.
  // The HeroUI Menu of the photo and of its link.
  const photoActions: MenuEntry[] = [
    { label: t.choosePhoto, icon: "photo.on.rectangle", onPress: () => pick("library") },
    { label: t.takePhoto, icon: "camera", onPress: () => pick("camera") },
    !!photo && "divider",
    !!photo && { label: t.removePhoto, icon: "trash", destructive: true, onPress: () => setPhoto(null) },
  ];

  const submit = async () => {
    if (!complete || pending) return;
    if (password !== confirm) return setError({ message: t.mismatch, on: "confirm" });
    setPending(true);
    setError(null);
    try {
      await publicRequest(server, `/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({ ...trimmed, password }),
      });
    } catch (err) {
      setPending(false);
      return setError({ message: err instanceof Error ? err.message : t.createFailed, on: "form" });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // The account exists: this phone gets its own session, as a password sign-in does (listed among the devices).
    let session: Awaited<ReturnType<typeof signIn>>;
    try {
      session = await signIn(org, email, password);
    } catch {
      return goToLogin(server);
    }
    // A brand-new account has no two-step verification; should it ever, the login screen asks for the code.
    if ("twoFactor" in session) return goToLogin(server);
    // The session is open: a rejected photo must not block onboarding.
    if (photo) await uploadPhoto(server, session.token, photo).catch(() => {});
    await save(session.server, session.token);
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };

  return (
    <AuthScreen title={t.welcome(org.name)} hint={t.hint} logo={{ server: org.url, image: org.image }}>
      <View className="items-center gap-2">
        <TapMenu actions={photoActions} accessibilityLabel={photo ? t.changePhoto : t.addPhoto}>
          <Avatar size="lg" alt={name} className="size-22">
            {!!photo && <Avatar.Image source={{ uri: photo.uri }} />}
            <Avatar.Fallback>
              <Marble name={email} size={88} />
            </Avatar.Fallback>
          </Avatar>
        </TapMenu>
        <TapMenu actions={photoActions}>
          <LinkButton>{photo ? t.changePhoto : t.addPhoto}</LinkButton>
        </TapMenu>
      </View>

      <View className="mt-6 gap-4">
        <TextField isDisabled>
          <Label>{t.email}</Label>
          <InputGroup>
            <InputGroup.Prefix isDecorative>
              <MailIcon size={16} className="text-field-placeholder" />
            </InputGroup.Prefix>
            <InputGroup.Input value={email} editable={false} />
          </InputGroup>
        </TextField>
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
        <TextField isRequired>
          <Label>{t.username}</Label>
          <InputGroup>
            <InputGroup.Prefix isDecorative>
              <AtIcon size={16} className="text-field-placeholder" />
            </InputGroup.Prefix>
            <InputGroup.Input
              value={form.username}
              onChangeText={set("username")}
              maxLength={30}
              placeholder={t.usernamePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </InputGroup>
        </TextField>
        <TextField>
          <Label>{t.bio}</Label>
          <TextArea value={form.bio} onChangeText={set("bio")} maxLength={500} placeholder={t.bioPlaceholder} />
        </TextField>
        <LoginField
          label={t.password}
          icon={LockIcon}
          description={t.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <LoginField
          ref={confirmRef}
          label={t.confirm}
          icon={LockIcon}
          value={confirm}
          onChangeText={setConfirm}
          error={error?.on === "confirm" ? error.message : null}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      {error?.on === "form" && (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t.createFailed}</Alert.Title>
            {error.message !== t.createFailed && <Alert.Description>{error.message}</Alert.Description>}
          </Alert.Content>
        </Alert>
      )}
      <Button size="lg" isDisabled={pending || !complete} onPress={submit} className="mt-6 w-full">
        {pending ? t.creating : t.create}
      </Button>
    </AuthScreen>
  );
}

/** The instance's sign-in screen, or the address step when it doesn't answer as an Agora space. */
function goToLogin(server: string) {
  findOrg(server)
    .then((org) => router.replace({ pathname: "/login", params: { url: org.url, name: org.name, image: org.image ?? "" } }))
    .catch(() => router.replace("/server"));
}

/** The photo picked on the form, sent with the new session (components/profile/me.ts uploadAvatar, before ServerScope exists). */
async function uploadPhoto(server: string, token: string, photo: Photo) {
  const body = await readLocalFile(photo.uri);
  const res = await fetch(`${server}/api/me/avatar`, {
    method: "PUT",
    headers: { "Content-Type": photo.mime, "X-Agora-Locale": locale, Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(String(res.status));
}
