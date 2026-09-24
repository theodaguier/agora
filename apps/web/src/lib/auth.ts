import { adminClient, inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same origin as the app: Vite (dev) or Caddy (prod) proxies /api to the server.
export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    // Two-step sign-in: the login screen handles the redirect itself (screens/Login.tsx).
    twoFactorClient(),
    // Profile fields declared on the API side (auth.ts), updated via /api/me.
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false, input: false },
        lastName: { type: "string", required: false, input: false },
        username: { type: "string", required: false, input: false },
        bio: { type: "string", required: false, input: false },
        title: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, input: false },
        releaseNotesSeen: { type: "string", required: false, input: false },
        digestSeen: { type: "string", required: false, input: false },
      },
    }),
  ],
});
