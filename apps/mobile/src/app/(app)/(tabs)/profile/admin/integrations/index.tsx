import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Chip, ListGroup } from "heroui-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, RowMenu, Section, SettingsScroll } from "@/components/admin/ui";
import { integrationHref, integrationsMessages as t, integrationsQuery, SPECS, useDisconnect } from "@/components/admin/integrations";
import { IntegrationTile } from "@/components/marketplace/integration-type";

/* apps/web/src/components/admin/AppIntegrations.tsx: Settings › Integrations (admin). */

export default function Integrations() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <IntegrationList />
      </AdminGate>
    </>
  );
}

function IntegrationList() {
  const router = useRouter();
  const { data, error, isPending, refetch } = useQuery(integrationsQuery);
  const { ask } = useDisconnect();

  return (
    <SettingsScroll onRefresh={refetch}>
      <Intro>{t.intro}</Intro>
      <ErrorAlert error={error} />
      {isPending ? (
        <LoadingRows rows={2} />
      ) : (
        !!data?.length && (
          <Section>
            {data.map((i) => {
              const spec = SPECS[i.id];
              const details = spec.fields.map((f) => i.values[f.name]).filter(Boolean);
              const open = () => {
                Haptics.selectionAsync();
                router.push(integrationHref(i.id));
              };
              return (
                <RowMenu
                  key={i.id}
                  actions={[
                    { label: i.source ? t.edit : t.connect, icon: "pencil", onPress: open },
                    { label: t.disconnect, icon: "xmark", destructive: true, disabled: i.source !== "app", onPress: () => ask(i.id) },
                  ]}
 >
                  <PressableRow onPress={open}>
                    <ListGroup.ItemPrefix>
                      <IntegrationTile type={spec.type} domain={spec.domain} />
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>{spec.name}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription numberOfLines={2}>{t.purpose[i.id]}</ListGroup.ItemDescription>
                      {details.length > 0 && <ListGroup.ItemDescription numberOfLines={1}>{details.join(" · ")}</ListGroup.ItemDescription>}
                    </ListGroup.ItemContent>
                    {!!i.source && (
                      <Chip size="sm" variant="soft" color={i.source === "app" ? "success" : "default"}>
                        <Chip.Label>{i.source === "app" ? t.connected : t.fromEnv}</Chip.Label>
                      </Chip>
                    )}
                    <ListGroup.ItemSuffix />
                  </PressableRow>
                </RowMenu>
              );
            })}
          </Section>
        )
      )}
    </SettingsScroll>
  );
}
