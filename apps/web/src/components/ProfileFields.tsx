import { useEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileInput } from "@/lib/api";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { CameraIcon } from "@/components/icons";
import { cropAvatar, readImage } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    firstName: "First name",
    lastName: "Last name",
    role: "Role",
    rolePlaceholder: "Developer, spouse…",
    username: "Username",
    usernamePlaceholder: "first.last",
    bio: "Bio",
    bioPlaceholder: "A few words about you and what you do here.",
    photo: "Profile photo",
    changePhoto: "Change photo",
    addPhoto: "Add a photo",
    pickHint: "JPEG, PNG or WebP.",
    unreadable: "This image couldn't be read.",
  },
  fr: {
    firstName: "Prénom",
    lastName: "Nom",
    role: "Rôle",
    rolePlaceholder: "Développeur, conjoint…",
    username: "Username",
    usernamePlaceholder: "prenom.nom",
    bio: "Bio",
    bioPlaceholder: "Quelques mots sur toi, ce que tu fais ici.",
    photo: "Photo de profil",
    changePhoto: "Changer la photo",
    addPhoto: "Ajouter une photo",
    pickHint: "JPEG, PNG ou WebP.",
    unreadable: "Cette image n'a pas pu être lue.",
  },
});

/**
 * Profile fields: first name, last name, role and username required, bio optional.
 * Uncontrolled form: the parent reads the values back with readProfile().
 */
export function ProfileFields({
  idPrefix,
  defaults,
  rows,
}: {
  idPrefix: string;
  defaults?: Partial<ProfileInput>;
  /** Settings: one row per field, the label on the left, the input on the right (as Linear's). */
  rows?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const t = useT(messages);
  const fields = [
    { name: "firstName", label: t.firstName, required: true, input: <Input id={id("firstName")} name="firstName" required maxLength={60} autoComplete="given-name" defaultValue={defaults?.firstName} /> },
    { name: "lastName", label: t.lastName, required: true, input: <Input id={id("lastName")} name="lastName" required maxLength={60} autoComplete="family-name" defaultValue={defaults?.lastName} /> },
    { name: "title", label: t.role, required: true, input: <Input id={id("title")} name="title" required maxLength={60} placeholder={t.rolePlaceholder} defaultValue={defaults?.title} /> },
    {
      name: "username",
      label: t.username,
      required: true,
      input: (
        <Input
          id={id("username")}
          name="username"
          required
          maxLength={30}
          pattern="[a-zA-Z0-9._]{2,30}"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t.usernamePlaceholder}
          defaultValue={defaults?.username}
        />
      ),
    },
    { name: "bio", label: t.bio, required: false, input: <Textarea id={id("bio")} name="bio" maxLength={500} rows={rows ? 2 : 3} placeholder={t.bioPlaceholder} defaultValue={defaults?.bio} /> },
  ];
  if (rows)
    return (
      <>
        {fields.map((f) => (
          <div key={f.name} className={cn("flex justify-between gap-6 px-4 py-3", f.name === "bio" ? "items-start" : "items-center")}>
            <FormLabel htmlFor={id(f.name)} required={f.required} className="font-medium text-foreground">
              {f.label}
            </FormLabel>
            <div className="w-72 shrink-0">{f.input}</div>
          </div>
        ))}
      </>
    );
  return (
    <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => (
        <Field key={f.name} className={f.name === "bio" ? "sm:col-span-2" : undefined}>
          <FormLabel htmlFor={id(f.name)} required={f.required}>
            {f.label}
          </FormLabel>
          {f.input}
        </Field>
      ))}
    </div>
  );
}

/** Picked photo, not uploaded yet: `null` = remove the photo, `undefined` = unchanged. */
export type AvatarChange = Blob | null | undefined;

export function AvatarField({
  id,
  name,
  current,
  value,
  onChange,
  label,
}: {
  id: string;
  name: string;
  current: string | null;
  value: AvatarChange;
  onChange: (next: AvatarChange) => void;
  /** Defaults to "Profile photo". */
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const t = useT(messages);
  const c = useT(common);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ bitmap: ImageBitmap; url: string } | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const shown = value === null ? null : (preview ?? current);

  // A picked file goes through the crop dialog before replacing the photo.
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPicked({ bitmap: await readImage(file), url: URL.createObjectURL(file) });
    } catch {
      setError(t.unreadable);
    }
  };
  const close = () => {
    if (!picked) return;
    picked.bitmap.close();
    URL.revokeObjectURL(picked.url);
    setPicked(null);
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label={shown ? t.changePhoto : t.addPhoto}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (![...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "relative size-12 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          over && "ring-3 ring-ring/60 ring-offset-2 ring-offset-background",
        )}
      >
        {/* No name yet: an empty disc with the camera, never a "?" placeholder. */}
        {shown || name ? (
          <PersonAvatar person={{ id, name, image: shown }} className="size-12" />
        ) : (
          <Avatar className="size-12">
            <AvatarFallback>
              <CameraIcon />
            </AvatarFallback>
          </Avatar>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-ui font-medium">{label ?? t.photo}</span>
        {error ? <FieldError>{error}</FieldError> : <FieldDescription className="text-ui">{t.pickHint}</FieldDescription>}
      </div>
      {shown && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(current ? null : undefined)} className="text-muted-foreground">
          {c.remove}
        </Button>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
        {shown ? t.changePhoto : t.addPhoto}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          pick(file);
        }}
      />
      <AvatarCropDialog
        image={picked}
        onCancel={close}
        onApply={async (crop) => {
          if (!picked) return;
          try {
            onChange(await cropAvatar(picked.bitmap, crop));
          } catch {
            setError(t.unreadable);
          }
          close();
        }}
      />
    </div>
  );
}
