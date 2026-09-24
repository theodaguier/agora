import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { BotIcon, BuildingIcon, CalendarClockIcon, FileTextIcon, CheckCircleIcon, LayersIcon, PaletteIcon, BrainIcon, ChartIcon, KeyIcon, LockIcon, RefreshIcon, PlugIcon, SlidersIcon, SmartphoneIcon, UsersIcon, CloseIcon, type IconComponent } from "@/components/icons";
import { lazy, Suspense, useState } from "react";
import { Access } from "@/components/admin/Access";
import { AppIntegrations } from "@/components/admin/AppIntegrations";
import { Agents } from "@/components/admin/Agents";
import { Models } from "@/components/admin/Models";
import { OrgSettings } from "@/components/admin/OrgSettings";
import { ErrorText, Loading, RestartProvider } from "@/components/admin/ui";
import { Status } from "@/components/admin/Status";
import { Updates } from "@/components/admin/Updates";
import { Users } from "@/components/admin/Users";
import { Vault } from "@/components/admin/Vault";
import { Appearance } from "@/components/Appearance";
import { MobileApp } from "@/components/MobileApp";
import { TwoFactor } from "@/components/TwoFactor";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { WikiMemory } from "@/components/admin/WikiMemory";
import { DigestSettings } from "@/components/admin/DigestSettings";
import { AvatarField, ProfileFields, type AvatarChange } from "@/components/ProfileFields";
import { readProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { api, uploadAvatar, type ProfileInput } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { closeSettings, type SettingsTab, useSettingsTab } from "@/lib/settings";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { cn } from "@/lib/utils";

// Recharts only loads with the usage tab.
const Usage = lazy(() => import("@/components/Usage").then((m) => ({ default: m.Usage })));

const tabs: { id: SettingsTab; icon: IconComponent; admin?: true }[] = [
  { id: "general", icon: SlidersIcon },
  { id: "availability", icon: CalendarClockIcon },
  { id: "appearance", icon: PaletteIcon },
  { id: "mobile", icon: SmartphoneIcon },
  { id: "organization", icon: BuildingIcon, admin: true },
  { id: "users", icon: UsersIcon, admin: true },
  { id: "agents", icon: BotIcon, admin: true },
  { id: "access", icon: KeyIcon, admin: true },
  { id: "vault", icon: LockIcon, admin: true },
  { id: "integrations", icon: PlugIcon, admin: true },
  { id: "models", icon: LayersIcon, admin: true },
  { id: "memory", icon: BrainIcon, admin: true },
  { id: "digest", icon: FileTextIcon, admin: true },
  { id: "usage", icon: ChartIcon },
  { id: "status", icon: CheckCircleIcon, admin: true },
  { id: "updates", icon: RefreshIcon, admin: true },
];

const messages = defineMessages({
  en: {
    settings: "Settings",
    tabs: {
      general: "General",
      availability: "Availability",
      appearance: "Appearance",
      mobile: "Mobile app",
      organization: "Organization",
      users: "Users",
      agents: "Agents",
      access: "Access",
      vault: "Vault",
      integrations: "Integrations",
      models: "Models",
      memory: "Memory",
      digest: "Recaps",
      usage: "Usage",
      status: "Status",
      updates: "Updates",
    } as Record<SettingsTab, string>,
    profile: "Profile",
    account: "Account",
    admin: "Admin",
    member: "Member",
    signOut: "Sign out",
    profileSaved: "Profile saved.",
    availabilityHelp: "Colleagues and bots see when you're away or outside your working hours: they're told before writing to you, and bots avoid calling on you.",
  },
  fr: {
    settings: "Paramètres",
    tabs: {
      general: "Général",
      availability: "Disponibilité",
      appearance: "Apparence",
      mobile: "App mobile",
      organization: "Organisation",
      users: "Utilisateurs",
      agents: "Agents",
      access: "Accès",
      vault: "Coffre",
      integrations: "Intégrations",
      models: "Modèles",
      memory: "Mémoire",
      digest: "Récaps",
      usage: "Consommation",
      status: "Statut",
      updates: "Mises à jour",
    },
    profile: "Profil",
    account: "Compte",
    admin: "Admin",
    member: "Membre",
    signOut: "Se déconnecter",
    profileSaved: "Profil enregistré.",
    availabilityHelp: "Tes collègues et les bots voient quand tu es absent·e ou hors de tes horaires : ils sont prévenus avant de t'écrire, et les bots évitent de te solliciter.",
  },
});

/** Mounted once in AppShell; opened via openSettings(). */
export function Settings() {
  const tab = useSettingsTab();
  const t = useT(messages);
  const c = useT(common);
  // Content stays visible during the close animation; each opening starts from the requested tab.
  const [prev, setPrev] = useState(tab);
  const [opened, setOpened] = useState({ tab: tab ?? "general", n: 0 });
  if (tab !== prev) {
    setPrev(tab);
    if (tab) setOpened((o) => ({ tab, n: o.n + 1 }));
  }

  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(88vh,900px)] sm:w-[calc(100%-3rem)] sm:max-w-[1040px] sm:flex-row sm:rounded-2xl sm:border"
      >
        <DialogTitle className="sr-only">{t.settings}</DialogTitle>
        <SettingsBody key={opened.n} initial={opened.tab} />
        <DialogClose
          render={<Button variant="ghost" size="icon-lg" className="absolute right-2 top-2 z-10 sm:right-3 sm:top-3" />}
        >
          <CloseIcon />
          <span className="sr-only">{c.close}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({ initial }: { initial: SettingsTab }) {
  const { user } = useRouteContext({ from: "/app" });
  const m = useT(messages);
  const visible = tabs.filter((t) => !t.admin || user.role === "admin");
  const [tab, setTab] = useState(visible.some((t) => t.id === initial) ? initial : "general");

  return (
    <>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-sidebar p-2 pr-14 sm:w-56 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
        {visible.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-9 justify-start gap-2.5 rounded-lg px-2.5 text-[15px] font-normal",
              tab === t.id ? "bg-muted text-foreground" : "text-foreground/90 hover:bg-muted/60 hover:text-foreground/90",
            )}
          >
            <t.icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} /> {m.tabs[t.id]}
          </Button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-10 sm:pt-12">
          <RestartProvider>
            {tab === "general" && <General />}
            {tab === "availability" && <Availability />}
            {tab === "appearance" && <Appearance />}
            {tab === "mobile" && <Mobile />}
            {tab === "organization" && <Organization />}
            {tab === "users" && <Users />}
            {tab === "agents" && <Agents />}
            {tab === "access" && <Access />}
            {tab === "vault" && <Vault />}
            {tab === "integrations" && <AppIntegrations />}
            {tab === "models" && <Models />}
            {tab === "usage" && (
              <Suspense fallback={<Loading />}>
                <Usage />
              </Suspense>
            )}
            {tab === "status" && <Status />}
            {tab === "updates" && <Updates />}
            {tab === "memory" && <WikiMemory />}
            {tab === "digest" && <DigestSettings />}
          </RestartProvider>
        </div>
      </div>
    </>
  );
}

function General() {
  const { user } = useRouteContext({ from: "/app" });
  const navigate = useNavigate();
  const t = useT(messages);

  return (
    <>
      <h2 className="mb-7 text-lg font-semibold tracking-tight">{t.tabs.general}</h2>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t.profile}</FieldLegend>
          <ProfileEditor />
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>{t.account}</FieldLegend>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{user.email}</ItemTitle>
              <ItemDescription>{user.role === "admin" ? t.admin : t.member}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await authClient.signOut();
                  closeSettings();
                  navigate({ to: "/login" });
                }}
              >
                {t.signOut}
              </Button>
            </ItemActions>
          </Item>
          <TwoFactor />
        </FieldSet>
      </FieldGroup>
    </>
  );
}

function Mobile() {
  const t = useT(messages);
  return (
    <>
      <h2 className="mb-7 text-lg font-semibold tracking-tight">{t.tabs.mobile}</h2>
      <MobileApp />
    </>
  );
}

function Organization() {
  const t = useT(messages);
  return (
    <>
      <h2 className="mb-7 text-lg font-semibold tracking-tight">{t.tabs.organization}</h2>
      <OrgSettings />
    </>
  );
}

function Availability() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight">{t.tabs.availability}</h2>
      <p className="mb-7 mt-1 text-sm text-muted-foreground">{t.availabilityHelp}</p>
      <AvailabilityEditor userId={user.id} self />
    </>
  );
}

function ProfileEditor() {
  const { user } = useRouteContext({ from: "/app" });
  const router = useRouter();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<AvatarChange>(undefined);
  const [saved, setSaved] = useState(false);
  const t = useT(messages);
  const c = useT(common);
  const save = useMutation({
    mutationFn: async (profile: ProfileInput) => {
      await api("/me", { method: "PATCH", body: JSON.stringify(profile) });
      if (photo) await uploadAvatar(photo);
      else if (photo === null) await api("/me/avatar", { method: "DELETE" });
    },
    onSuccess: async () => {
      setPhoto(undefined);
      setSaved(true);
      // The session (route context) carries the profile: refetch it.
      await router.invalidate();
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      onInput={() => setSaved(false)}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(readProfile(new FormData(e.currentTarget)));
      }}
    >
      <AvatarField
        id={user.id}
        name={user.name}
        current={user.image ?? null}
        value={photo}
        onChange={(next) => {
          setSaved(false);
          setPhoto(next);
        }}
      />
      <ProfileFields
        idPrefix="profile"
        defaults={{ firstName: user.firstName ?? "", lastName: user.lastName ?? "", title: user.title ?? "", username: user.username ?? "", bio: user.bio ?? "" }}
      />
      <Field orientation="horizontal">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
        {saved && <FieldDescription>{t.profileSaved}</FieldDescription>}
        <ErrorText error={save.error} />
      </Field>
    </form>
  );
}
