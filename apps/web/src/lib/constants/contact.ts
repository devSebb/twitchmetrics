/** Topics offered on the /contact form; the API validates against this list. */
export const CONTACT_TOPICS = [
  "General question",
  "Sales & partnerships",
  "Reports & data",
  "Press",
  "Support",
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];
