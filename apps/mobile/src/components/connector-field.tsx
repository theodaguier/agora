import { envFileValue, fileMatchesAccept, mcpEnvAccept, mcpEnvInput, MCP_ENV_VALUE_MAX, type McpEnvField } from "@agora/core";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Button, Description, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { OptionPicker } from "@/components/menus";
import { defineMessages } from "@/lib/i18n";
import { withTap } from "@/lib/haptics";

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
  field,
  value,
  fileName,
  invalid,
  onChange,
}: {
  field: McpEnvField;
  value: string;
  fileName?: string;
  invalid?: boolean;
  onChange: (value: string, fileName?: string) => void;
}) {
  const t = messages;
  const [fileError, setFileError] = useState<string | null>(null);
  const input = mcpEnvInput(field);
  const accept = mcpEnvAccept(field);
  const plain = { autoCapitalize: "none", autoCorrect: false, autoComplete: "off" } as const;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (!fileMatchesAccept(asset.name, asset.mimeType ?? "", accept)) {
      setFileError(t.fileType);
      return;
    }
    if ((asset.size ?? 0) > MCP_ENV_VALUE_MAX) {
      setFileError(t.fileTooBig);
      return;
    }
    try {
      const text = envFileValue(await new File(asset.uri).text());
      if (text.length > MCP_ENV_VALUE_MAX) {
        setFileError(t.fileTooBig);
        return;
      }
      setFileError(null);
      onChange(text, asset.name);
    } catch {
      setFileError(t.unreadable);
    }
  };

  if (input === "file") {
    return (
      <TextField isRequired={field.required} isInvalid={invalid || !!fileError}>
        <Label>{field.name}</Label>
        <Button variant="secondary" className="w-full" onPress={withTap(pick)}>
          {fileName || t.chooseFile}
        </Button>
        {!!field.description && <Description>{field.description}</Description>}
        {(fileError || (invalid && !value)) && <Description className="text-danger">{fileError ?? t.requiredValue}</Description>}
      </TextField>
    );
  }

  if (input === "select") {
    const options = (field.options ?? []).map((o) => ({ value: o, label: o }));
    return (
      <TextField isRequired={field.required} isInvalid={invalid}>
        <Label>{field.name}</Label>
        <OptionPicker value={value} options={options} label={field.name} placeholder={field.placeholder || t.choose} onChange={(v) => onChange(v)} className="w-full" />
        {!!field.description && <Description>{field.description}</Description>}
        {invalid && !value && <Description className="text-danger">{t.requiredValue}</Description>}
      </TextField>
    );
  }

  return (
    <TextField isRequired={field.required} isInvalid={invalid}>
      <Label>{field.name}</Label>
      <Input
        value={value}
        onChangeText={(text) => onChange(text)}
        placeholder={field.placeholder}
        secureTextEntry={input === "secret"}
        multiline={input === "textarea"}
        numberOfLines={input === "textarea" ? 4 : undefined}
        {...plain}
      />
      {!!field.description && <Description>{field.description}</Description>}
    </TextField>
  );
}
