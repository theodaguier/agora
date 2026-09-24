import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useRootNavigationState, usePathname, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import type { Me } from "@/components/profile/me";
import { useServer } from "@/components/server-scope";
import { digestQuery } from "@/lib/digest";
import { sessionQuery } from "@/lib/queries";
import { latestRelease, markReleaseSeen } from "@/lib/whats-new";

/*
 * apps/web/src/components/WhatsNew.tsx and MorningDigest.tsx's automatic opening: "What's new"
 * comes up once per release, then the morning recap once per recap, each as a form sheet
 * ((app)/whats-new, (app)/digest). "Seen" is remembered on the account, like on the web, so
 * neither comes up again here or on another device.
 */

/** Opens by itself only on the day it was written: an older recap waits in the profile. */
const FRESH_MS = 20 * 3_600_000;

const WHATS_NEW = "/whats-new";
const DIGEST = "/digest";

/** Instances whose release notes were already handled since the app started. */
const checked = new Set<string>();
/** Recaps already opened automatically since the app started. */
const opened = new Set<string>();

export function Announcements() {
  const server = useServer();
  const qc = useQueryClient();
  const me = useQuery(sessionQuery).data as Me | null | undefined;
  const { data: digest } = useQuery(digestQuery);
  const pathname = usePathname();
  const ready = !!useRootNavigationState()?.key;
  // "What's new" first; the recap waits for it to be closed.
  const [releaseClosed, setReleaseClosed] = useState(false);
  const shown = useRef(false);
  const seen = !latestRelease || me?.releaseNotesSeen === latestRelease.version;
  // An account created after the release already has these features: nothing new to show.
  const newer = !!latestRelease && !!me?.createdAt && new Date(me.createdAt) >= new Date(latestRelease.date);
  const releaseDone = releaseClosed || (!!me && (seen || newer));

  useEffect(() => {
    if (!ready || !me || checked.has(server.url)) return;
    checked.add(server.url);
    if (!latestRelease || me.releaseNotesSeen === latestRelease.version) return;
    if (me.createdAt && new Date(me.createdAt) >= new Date(latestRelease.date)) {
      markReleaseSeen(latestRelease.version).then(() => qc.invalidateQueries({ queryKey: sessionQuery.queryKey }));
      return;
    }
    router.push(WHATS_NEW as Href);
  }, [ready, me, server.url, qc]);

  // The sheet was presented, then closed.
  useEffect(() => {
    if (pathname === WHATS_NEW) shown.current = true;
    else if (shown.current) {
      shown.current = false;
      setReleaseClosed(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (!ready || !releaseDone || !digest || digest.seen || opened.has(digest.id)) return;
    if (pathname === WHATS_NEW || pathname === DIGEST) return;
    // An account created since has nothing to catch up on.
    if (Date.now() - new Date(digest.createdAt).getTime() > FRESH_MS) return;
    if (me?.createdAt && new Date(me.createdAt) >= new Date(digest.createdAt)) return;
    opened.add(digest.id);
    router.push(DIGEST as Href);
  }, [ready, releaseDone, digest, pathname, me?.createdAt]);

  return null;
}
