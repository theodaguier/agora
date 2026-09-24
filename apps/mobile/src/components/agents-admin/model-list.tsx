import * as Haptics from "expo-haptics";
import { ListGroup, Separator } from "heroui-native";
import { Fragment } from "react";
import { CheckIcon } from "@/components/icons";
import { defineMessages } from "@/lib/i18n";

const t = defineMessages({ en: { reasoning: "reasoning" }, fr: { reasoning: "raisonnement" } });

/** The provider's models, the chosen one checked (iOS single-choice list). */
export function ModelList(props: { models: { id: string; reasoning: boolean }[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <ListGroup accessibilityRole="radiogroup">
      {props.models.map((m, i) => {
        const on = m.id === props.value;
        return (
          <Fragment key={m.id}>
            {i > 0 && <Separator className="mx-4" />}
            <ListGroup.Item
              disabled={props.disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: props.disabled }}
              onPress={() => {
                if (on) return;
                void Haptics.selectionAsync();
                props.onChange(m.id);
              }}
 >
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{m.id}</ListGroup.ItemTitle>
                {m.reasoning && <ListGroup.ItemDescription>{t.reasoning}</ListGroup.ItemDescription>}
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>{on ? <CheckIcon className="size-5 text-accent" /> : null}</ListGroup.ItemSuffix>
            </ListGroup.Item>
          </Fragment>
        );
      })}
    </ListGroup>
  );
}
