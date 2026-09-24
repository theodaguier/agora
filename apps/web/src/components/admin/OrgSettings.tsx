import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { languageOptions } from "@/lib/languages";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionSelect, SearchSelect } from "@/components/Pickers";
import { AvatarField, type AvatarChange } from "@/components/ProfileFields";
import { api, uploadAvatar } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    logo: "Logo",
    name: "Organization name",
    locale: "Default language",
    localeHelp: "Used for the interface and the agents. Members can override it in their settings.",
    timezone: "Time zone",
    searchTimezone: "Search time zones",
    timezoneHelp: "Used for dates in invitation emails and for daily usage stats.",
    nameHelp: "The name appears on the sign-in page, in invitations and in the agents' context.",
    saveFailed: "Couldn't save.",
  },
  fr: {
    logo: "Logo",
    name: "Nom de l'organisation",
    locale: "Langue par défaut",
    localeHelp: "Utilisée pour l'interface et les agents. Chaque membre peut la changer dans ses réglages.",
    timezone: "Fuseau horaire",
    searchTimezone: "Rechercher un fuseau",
    timezoneHelp: "Utilisé pour les dates des e-mails d'invitation et la consommation par jour.",
    nameHelp: "Le nom apparaît à la connexion, dans les invitations et dans le contexte des agents.",
    saveFailed: "Enregistrement impossible.",
  },
});

type Org = { name: string; locale: "fr" | "en"; timezone: string; image: string | null };

/** Organization settings (admin): name, agents' language, time zone. */
export function OrgSettings() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "org"], queryFn: () => api<Org>("/admin/org") });
  const [form, setForm] = useState<Org | null>(null);
  const [logo, setLogo] = useState<AvatarChange>(undefined);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return form ? [form.timezone] : [];
    }
  }, [form?.timezone]);
  const save = useMutation({
    mutationFn: async ({ name, locale, timezone }: Org) => {
      await api<Org>("/admin/org", { method: "PUT", body: JSON.stringify({ name, locale, timezone }) });
      if (logo) await uploadAvatar(logo, "/admin/org/avatar");
      else if (logo === null) await api("/admin/org/avatar", { method: "DELETE" });
    },
    onSuccess: () => {
      setLogo(undefined);
      qc.invalidateQueries({ queryKey: ["admin", "org"] });
      qc.invalidateQueries({ queryKey: ["org"] });
      qc.invalidateQueries({ queryKey: ["setup"] });
    },
  });
  if (!form) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(data) || logo !== undefined;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form);
      }}
    >
      <AvatarField id="org" name={form.name} current={data?.image ?? null} value={logo} onChange={setLogo} label={t.logo} />
      <Field>
        <FormLabel htmlFor="org-name" required>
          {t.name}
        </FormLabel>
        <Input id="org-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <FieldDescription>{t.nameHelp}</FieldDescription>
      </Field>
      <div className="grid items-start gap-5 sm:grid-cols-2 sm:gap-4">
        <Field>
          <FormLabel htmlFor="org-locale" required>
            {t.locale}
          </FormLabel>
          <OptionSelect
            id="org-locale"
            options={languageOptions}
            value={form.locale}
            onValueChange={(locale) => setForm({ ...form, locale: locale as Org["locale"] })}
          />
          <FieldDescription>{t.localeHelp}</FieldDescription>
        </Field>
        <Field>
          <FormLabel htmlFor="org-tz" required>
            {t.timezone}
          </FormLabel>
          <SearchSelect
            id="org-tz"
            options={zones}
            value={form.timezone}
            onValueChange={(timezone) => setForm({ ...form, timezone })}
            label={(z) => z.replaceAll("_", " ")}
            placeholder={t.searchTimezone}
          />
          <FieldDescription>{t.timezoneHelp}</FieldDescription>
        </Field>
      </div>
      <Field orientation="horizontal">
        <Button type="submit" disabled={!dirty || !form.name.trim() || save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
        {save.isSuccess && !dirty && <FieldDescription>{c.saved}</FieldDescription>}
        {save.error && <FieldError>{save.error instanceof Error ? save.error.message : t.saveFailed}</FieldError>}
      </Field>
    </form>
  );
}
