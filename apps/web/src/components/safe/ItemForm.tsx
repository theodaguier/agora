import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { VaultItem, VaultItemInput, VaultItemKind, VaultItemSecret } from "@agora/core";
import { ErrorText } from "@/components/admin/ui";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { vaultSecretQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { generatePassword, safeMessages } from "./shared";

const messages = defineMessages({
  en: {
    show: "Show",
    hide: "Hide",
    generate: "Generate",
    keepPassword: "Leave empty to keep the current password.",
    keepNumber: "Leave empty to keep the current number.",
    keepCvc: "Leave empty to keep the current code.",
    expiryHint: "MM/YY",
    expiryInvalid: "Month and year, like 08/29.",
    numberInvalid: "Between 12 and 19 digits.",
    cvcInvalid: "3 or 4 digits.",
    added: "Added to the vault.",
  },
  fr: {
    show: "Afficher",
    hide: "Masquer",
    generate: "Générer",
    keepPassword: "Laisse vide pour garder le mot de passe actuel.",
    keepNumber: "Laisse vide pour garder le numéro actuel.",
    keepCvc: "Laisse vide pour garder le code actuel.",
    expiryHint: "MM/AA",
    expiryInvalid: "Le mois et l'année, comme 08/29.",
    numberInvalid: "Entre 12 et 19 chiffres.",
    cvcInvalid: "3 ou 4 chiffres.",
    added: "Ajouté au coffre.",
  },
});

type Values = Record<string, string>;

const EXPIRY = /^(0[1-9]|1[0-2])\/\d{2}$/;

/** What the form starts from: the item's public fields, its secrets left empty (empty keeps them). */
const initialValues = (item?: VaultItem): Values => ({
  title: item?.title ?? "",
  website: item?.website ?? "",
  ...item?.fields,
  password: "",
  number: "",
  cvc: "",
});

/**
 * Creates or edits an item of a vault, one form per kind. Secrets left empty on an edit keep
 * their value; the notes, kept with the secrets, are fetched to be edited.
 */
export function ItemFormDialog({ vaultId, kind, item, onDone }: { vaultId: string; kind: VaultItemKind; item?: VaultItem; onDone: (item: VaultItem) => void }) {
  const t = useT(messages);
  const s = useT(safeMessages);
  const c = useT(common);
  const qc = useQueryClient();
  const [values, setValues] = useState<Values>(() => initialValues(item));
  // null: the notes as stored, untouched.
  const [notes, setNotes] = useState<string | null>(item ? null : "");
  const [shown, setShown] = useState(false);
  const [tried, setTried] = useState(false);
  const stored = useQuery({ ...vaultSecretQuery(vaultId, item?.id ?? ""), enabled: !!item });
  const set = (key: string) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const v = (key: string) => values[key] ?? "";

  const digits = v("number").replace(/\D/g, "");
  const expiryError = kind === "card" && v("expiry") && !EXPIRY.test(v("expiry").trim()) ? t.expiryInvalid : null;
  const numberError = kind === "card" && v("number").trim() && (digits.length < 12 || digits.length > 19) ? t.numberInvalid : null;
  const cvcError = kind === "card" && v("cvc").trim() && !/^\d{3,4}$/.test(v("cvc").trim()) ? t.cvcInvalid : null;
  const titleMissing = !v("title").trim();
  const valid = !titleMissing && !expiryError && !numberError && !cvcError;

  const save = useMutation({
    mutationFn: () => {
      // On an edit, an empty secret keeps its value and null clears it.
      const secret: Record<string, string | null> = {};
      if (notes !== null) secret.notes = notes.trim() ? notes : item ? null : "";
      let fields: Record<string, string>;
      if (kind === "login") {
        fields = { username: v("username").trim() };
        if (v("password")) secret.password = v("password");
      } else if (kind === "card") {
        // The last digits and the network are derived by the server from the number.
        fields = { holder: v("holder").trim(), expiry: v("expiry").trim() };
        if (digits) secret.number = digits;
        if (v("cvc").trim()) secret.cvc = v("cvc").trim();
      } else {
        fields = Object.fromEntries(["name", "email", "phone", "address", "company"].map((k) => [k, v(k).trim()]));
      }
      const body: VaultItemInput = {
        kind,
        title: v("title").trim(),
        ...(kind === "login" && { website: v("website").trim() || null }),
        fields,
        secret: secret as VaultItemSecret,
      };
      const base = `/vaults/${encodeURIComponent(vaultId)}/items`;
      return item
        ? api<VaultItem>(`${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(body) })
        : api<VaultItem>(base, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (saved) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["vaults", vaultId, "items"] }), qc.invalidateQueries({ queryKey: ["vaults"], exact: true })]);
      onDone(saved);
    },
    meta: { success: item ? c.saved : t.added, error: false },
  });

  const id = (key: string) => `vault-item-${key}`;
  const text = (key: keyof typeof s.field, props: { required?: boolean; type?: string; autoComplete?: string; placeholder?: string; inputMode?: "numeric" | "email" | "tel" | "url"; hint?: ReactNode; error?: string | null; autoFocus?: boolean } = {}) => (
    <Field data-invalid={!!props.error || (props.required && tried && !v(key).trim()) || undefined}>
      <FormLabel htmlFor={id(key)} required={props.required}>
        {s.field[key]}
      </FormLabel>
      <Input
        id={id(key)}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete ?? "off"}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        aria-invalid={!!props.error || undefined}
        value={v(key)}
        onChange={set(key)}
      />
      {(props.error || props.hint) && <FieldDescription>{props.error ?? props.hint}</FieldDescription>}
    </Field>
  );
  const secretInput = (key: "number" | "cvc", hint: string | null, error?: string | null) => (
    <Field data-invalid={!!error || undefined}>
      <FormLabel htmlFor={id(key)}>{s.field[key]}</FormLabel>
      <Input
        id={id(key)}
        type="password"
        autoComplete="off"
        inputMode="numeric"
        aria-invalid={!!error || undefined}
        value={v(key)}
        onChange={set(key)}
      />
      {(error || hint) && <FieldDescription>{error ?? hint}</FieldDescription>}
    </Field>
  );

  return (
    <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{item ? s.editKind[kind] : s.newKind[kind]}</DialogTitle>
      </DialogHeader>
      <form
        id="vault-item"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (valid) save.mutate();
        }}
      >
        <FieldGroup>
          {text("title", { required: true, autoFocus: true })}
          {kind === "login" && (
            <>
              {text("website", { inputMode: "url" })}
              {text("username", { autoComplete: "off" })}
              <Field>
                <FormLabel htmlFor={id("password")}>{s.field.password}</FormLabel>
                <InputGroup>
                  <InputGroupInput
                    id={id("password")}
                    type={shown ? "text" : "password"}
                    autoComplete="new-password"
                    spellCheck={false}
                    className="font-mono"
                    value={v("password")}
                    onChange={set("password")}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton onClick={() => setShown((x) => !x)}>{shown ? t.hide : t.show}</InputGroupButton>
                    <InputGroupButton
                      onClick={() => {
                        setValues((x) => ({ ...x, password: generatePassword() }));
                        setShown(true);
                      }}
                    >
                      {t.generate}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {item && <FieldDescription>{t.keepPassword}</FieldDescription>}
              </Field>
            </>
          )}
          {kind === "card" && (
            <>
              {text("holder", { autoComplete: "off" })}
              {secretInput("number", item ? t.keepNumber : null, numberError)}
              <div className="grid grid-cols-2 gap-4">
                {text("expiry", { placeholder: t.expiryHint, inputMode: "numeric", error: expiryError })}
                {secretInput("cvc", item ? t.keepCvc : null, cvcError)}
              </div>
            </>
          )}
          {kind === "contact" && (
            <>
              {text("name")}
              {text("email", { type: "email", inputMode: "email" })}
              {text("phone", { type: "tel", inputMode: "tel" })}
              {text("address")}
              {text("company")}
            </>
          )}
          <Field>
            <FormLabel htmlFor={id("notes")}>{s.field.notes}</FormLabel>
            <Textarea
              id={id("notes")}
              rows={3}
              disabled={!!item && notes === null && stored.isPending}
              value={notes ?? stored.data?.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="vault-item" disabled={save.isPending || (tried && !valid)}>
          {save.isPending ? c.saving : item ? c.save : c.add}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
