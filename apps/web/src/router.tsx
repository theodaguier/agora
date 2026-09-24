import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { api } from "./lib/api";
import { authClient } from "./lib/auth";
import { ForgotPassword } from "./screens/ForgotPassword";
import { Invite } from "./screens/Invite";
import { Login } from "./screens/Login";
import { ResetPassword } from "./screens/ResetPassword";
import { NewChat } from "./screens/NewChat";
import { Conversation } from "./screens/Conversation";
import { Welcome } from "./screens/Welcome";
import { Setup } from "./screens/Setup";
import { Tasks } from "./screens/Tasks";
import { Inbox } from "./screens/Inbox";
import { TwoFactorRequired } from "./screens/TwoFactorRequired";
import { orgQuery, setupQuery, useOrgLocale } from "./lib/org";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true } },
});

const rootRoute = createRootRoute({ component: Root });

/** Signed out, the interface follows the organization's language until this browser has one. */
function Root() {
  useOrgLocale();
  return <Outlet />;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    // Fresh instance: nobody can sign in yet, so the admin account is created first.
    if ((await queryClient.fetchQuery(setupQuery)).needed) throw redirect({ to: "/setup" });
    const { data } = await authClient.getSession();
    if (data) throw redirect({ to: "/" });
  },
  component: Login,
});

/** First-run wizard (public while no account exists, then admin-only). */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    const status = await queryClient.fetchQuery(setupQuery);
    if (status.needed) return;
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/login" });
    if (status.completed || data.user.role !== "admin") throw redirect({ to: "/" });
  },
  component: Setup,
});

/** Invitation link received by email: public, the token is enough. */
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/invite/$token", component: Invite });

/** Password recovery: public, the reset link received by email carries the token. */
const forgotPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: ForgotPassword });
const resetPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset-password/$token", component: ResetPassword });

/** Two-step verification required by the organization and not yet on for this account. */
const twoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/two-factor",
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/login" });
    if (data.user.twoFactorEnabled || !(await queryClient.fetchQuery({ ...orgQuery, staleTime: 0 })).requireTwoFactor) throw redirect({ to: "/" });
  },
  component: TwoFactorRequired,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    const status = await queryClient.fetchQuery(setupQuery);
    if (!data) throw redirect({ to: status.needed ? "/setup" : "/login" });
    // Setup started but not finished: the admin resumes the wizard.
    if (!status.completed && data.user.role === "admin") throw redirect({ to: "/setup" });
    if (!data.user.twoFactorEnabled && (await queryClient.fetchQuery(orgQuery)).requireTwoFactor) throw redirect({ to: "/two-factor" });
    return { user: data.user };
  },
  component: AppShell,
});
const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: Welcome });
const newChatRoute = createRoute({ getParentRoute: () => appRoute, path: "/new", component: NewChat });
const tasksRoute = createRoute({ getParentRoute: () => appRoute, path: "/tasks", component: Tasks });
const inboxRoute = createRoute({ getParentRoute: () => appRoute, path: "/inbox", component: Inbox });
/** `?m=<messageId>`: opens the conversation on that message (from the inbox). */
const conversationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/c/$conversationId",
  validateSearch: (search: Record<string, unknown>): { m?: string } => (typeof search.m === "string" ? { m: search.m } : {}),
  component: Conversation,
});
/** Legacy URL of a thread with a bot: opens (or creates) the direct conversation. */
const agentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/a/$agentId",
  beforeLoad: async ({ params }) => {
    const { id } = await api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify({ agentId: params.agentId }) });
    throw redirect({ to: "/c/$conversationId", params: { conversationId: id }, replace: true });
  },
});
const routeTree = rootRoute.addChildren([loginRoute, setupRoute, twoFactorRoute, inviteRoute, forgotPasswordRoute, resetPasswordRoute, appRoute.addChildren([homeRoute, newChatRoute, tasksRoute, inboxRoute, conversationRoute, agentRoute])]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
