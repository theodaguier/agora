import { useEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Field, FieldDescription } from "@/components/ui/field";
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
    pickHint: "Click the picture or drop an image on it. JPEG, PNG or WebP.",
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
    pickHint: "Clique sur l'image ou dépose une photo dessus. JPEG, PNG ou WebP.",
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
}: {
  idPrefix: string;
  defaults?: Partial<ProfileInput>;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const t = useT(messages);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FormLabel htmlFor={id("firstName")} required>
          {t.firstName}
        </FormLabel>
        <Input id={id("firstName")} name="firstName" required maxLength={60} autoComplete="given-name" defaultValue={defaults?.firstName} />
      </Field>
      <Field>
        <FormLabel htmlFor={id("lastName")} required>
          {t.lastName}
        </FormLabel>
        <Input id={id("lastName")} name="lastName" required maxLength={60} autoComplete="family-name" defaultValue={defaults?.lastName} />
      </Field>
      <Field>
        <FormLabel htmlFor={id("title")} required>
          {t.role}
        </FormLabel>
        <Input id={id("title")} name="title" required maxLength={60} placeholder={t.rolePlaceholder} defaultValue={defaults?.title} />
      </Field>
      <Field>
        <FormLabel htmlFor={id("username")} required>
          {t.username}
        </FormLabel>
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
      </Field>
      <Field className="sm:col-span-2">
        <FormLabel htmlFor={id("bio")}>{t.bio}</FormLabel>
        <Textarea id={id("bio")} name="bio" maxLength={500} rows={3} placeholder={t.bioPlaceholder} defaultValue={defaults?.bio} />
      </Field>
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
          "group/avatar relative size-16 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          over && "ring-3 ring-ring/60 ring-offset-2 ring-offset-background",
        )}
      >
        <PersonAvatar person={{ id, name: name || "?", image: shown }} className="size-16" />
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100",
            over && "opacity-100",
          )}
        >
          <CameraIcon className="size-5" />
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{label ?? t.photo}</span>
        {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : <FieldDescription>{t.pickHint}</FieldDescription>}
        {shown && (
          <Button
            type="button"
            variant="link"
            onClick={() => onChange(current ? null : undefined)}
            className="h-auto self-start p-0 text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            {c.remove}
          </Button>
        )}
      </div>
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
