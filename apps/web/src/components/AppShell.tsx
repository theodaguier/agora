import { useAccountLocale } from "@/lib/org";
import type { CSSProperties } from "react";
import { Outlet, useLocation, useRouteContext } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEvents } from "@/lib/realtime";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { ProfileSheet } from "@/components/ProfileSheet";
import { Settings } from "@/components/Settings";
import { Shortcuts } from "@/components/Shortcuts";
import { AppSidebar } from "@/components/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WhatsNew } from "@/components/WhatsNew";
import { MorningDigest } from "@/components/MorningDigest";

/** Desktop: list + thread side by side. Mobile: the list is the home screen, the thread opens full screen. */
export function AppShell() {
  const atRoot = useLocation({ select: (l) => l.pathname === "/" });
  const { user } = useRouteContext({ from: "/app" });
  useEvents(user.id);
  useAccountLocale(user.locale);
  return (
    <SidebarProvider
      defaultOpen={!document.cookie.includes("sidebar_state=false")}
      style={{ "--sidebar-width": "20rem", "--sidebar-width-icon": "4rem" } as CSSProperties}
      className="h-dvh min-h-0 overflow-hidden"
    >
      <AppSidebar />
      <SidebarInset className={cn("min-w-0", atRoot && "max-md:hidden")}>
        <Outlet />
      </SidebarInset>
      <Settings />
      <ProfileSheet />
      <ConfirmHost />
      <Shortcuts />
      <WhatsNew />
      {/* After WhatsNew: waits for the changelog to be closed. */}
      <MorningDigest />
    </SidebarProvider>
  );
}
