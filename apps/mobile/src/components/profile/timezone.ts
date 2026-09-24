/** A person following the organization's time zone: stored as null, shown as this row. */
export const ORG_TIMEZONE = "org";

/** "America/New_York" → "America/New York", like the web's SearchSelect label. */
export const zoneLabel = (zone: string) => zone.replaceAll("_", " ");
