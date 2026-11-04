import { envFileValue, envValue, fileMatchesAccept, isUrlEnvName, mcpEnvAccept, mcpEnvInput, MCP_ENV_VALUE_MAX, type McpEnvField } from "@agora/core";
import { useRef, useState } from "react";
import { RequiredMark } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    chooseFile: "Choose a file",
    fileTooBig: "This file is too large (32 KB max).",
    fileType: "This file type isn't accepted.",
    unreadable: "This file can't be read.",
    choose: "Choose",
    requiredValue: "Required.",
  },
  fr: {
    chooseFile: "Choisir un fichier",
    fileTooBig: "Ce fichier est trop lourd (32 Ko max).",
    fileType: "Ce type de fichier n'est pas accepté.",
    unreadable: "Ce fichier ne peut pas être lu.",
    choose: "Choisir",
    requiredValue: "Obligatoire.",
  },
});

/** One configuration field of a connector: text, masked value, long text, file or list. */
export function ConnectorField({
  id,
  field,
  value,
  fileName,
  invalid,
  onChange,
  className,
}: {
  id: string;
  field: McpEnvField;
  value: string;
  fileName?: string;
  invalid?: boolean;
  /** `fileName` is set when the value comes from a picked file, so the form shows the name and not the contents. */
  onChange: (value: string, fileName?: string) => void;
  className?: string;
}) {
  const t = useT(messages);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = mcpEnvInput(field);
  const accept = mcpEnvAccept(field);
  // An address typed without its scheme gets https:// when the field is left.
  const complete = () => {
    const next = envValue(field.name, value);
    if (next !== value) onChange(next);
  };

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    if (!fileMatchesAccept(file.name, file.type, accept)) {
      setFileError(t.fileType);
      return;
    }
    if (file.size > MCP_ENV_VALUE_MAX) {
      setFileError(t.fileTooBig);
      return;
    }
    try {
      const text = envFileValue(await file.text());
      if (text.length > MCP_ENV_VALUE_MAX) {
        setFileError(t.fileTooBig);
        return;
      }
      setFileError(null);
      onChange(text, file.name);
    } catch {
      setFileError(t.unreadable);
    }
  };

  return (
    <Field className={className} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>
        {field.name}
        {field.required && <RequiredMark />}
      </FieldLabel>
      {input === "file" ? (
        <>
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-invalid={invalid || !!fileError || undefined}
            onClick={() => fileRef.current?.click()}
            className="w-full justify-start"
          >
            <span className="truncate">{fileName || t.chooseFile}</span>
          </Button>
          <input ref={fileRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
        </>
      ) : input === "select" ? (
        <Select items={(field.options ?? []).map((o) => ({ value: o, label: o }))} value={value || null} onValueChange={(v) => onChange(v ?? "")}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
            <SelectValue placeholder={field.placeholder || t.choose} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : input === "textarea" ? (
        <Textarea
          id={id}
          required={field.required}
          value={value}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          rows={4}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          required={field.required}
          type={input === "secret" ? "password" : "text"}
          inputMode={isUrlEnvName(field.name) ? "url" : undefined}
          value={value}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={complete}
        />
      )}
      {field.description && <FieldDescription>{field.description}</FieldDescription>}
      {(fileError || (invalid && input !== "text" && input !== "secret" && input !== "textarea" && !value)) && (
        <FieldError>{fileError ?? t.requiredValue}</FieldError>
      )}
    </Field>
  );
}
