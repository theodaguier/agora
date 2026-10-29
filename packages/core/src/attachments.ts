/**
 * Largest file a user can attach to a message (the composer checks it before uploading, the API
 * while it streams the upload to disk). Videos are what make it this large.
 */
export const MAX_ATTACHMENT = 2 * 1024 * 1024 * 1024;
