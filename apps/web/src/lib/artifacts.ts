import { queryOptions } from "@tanstack/react-query";
import type { ArtifactDto, ArtifactShareMode, ArtifactSummary } from "@agora/core";
import { api } from "./api";

const path = (id: string, rest = "") => `/artifacts/${encodeURIComponent(id)}${rest}`;

/** Every artifact of the reader's conversations, the latest changed first. */
export const artifactsQuery = queryOptions({ queryKey: ["artifacts"], queryFn: () => api<ArtifactSummary[]>("/artifacts") });

/** An artifact, its versions and its share link. */
export const artifactQuery = (id: string) => queryOptions({ queryKey: ["artifact", id], queryFn: () => api<ArtifactDto>(path(id)) });

export const setArtifactShare = (id: string, mode: ArtifactShareMode) => api<ArtifactDto>(path(id, "/share"), { method: "PATCH", body: JSON.stringify({ mode }) });

/** A version's page as the app's frame loads it (the latest without `version`). */
export const artifactContentUrl = (id: string, version?: number) => `/api${path(id, "/content")}${version ? `?v=${version}` : ""}`;

/** The share link, absolute: what is copied and sent around. */
export const artifactShareUrl = (artifact: ArtifactDto) => new URL(artifact.sharePath, window.location.origin).toString();
