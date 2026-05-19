export type ManagerCompletionInput = {
  name?: string | null | undefined;
  email?: string | null | undefined;
  agencyName?: string | null | undefined;
  bio?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  country?: string | null | undefined;
  languages?: readonly string[] | null | undefined;
  contactEmail?: string | null | undefined;
  activeRosterCount?: number | null | undefined;
};

export type ManagerCompletionField = {
  key:
    | "name"
    | "email"
    | "agencyOrBio"
    | "websiteUrl"
    | "country"
    | "languages"
    | "contactEmail"
    | "roster";
  label: string;
  weight: number;
  filled: boolean;
};

export type ManagerCompletionResult = {
  percentage: number;
  fields: ManagerCompletionField[];
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function computeManagerCompletion(
  input: ManagerCompletionInput,
): ManagerCompletionResult {
  // "agencyOrBio" treats agency name and bio as a single signal — a solo
  // manager who writes a bio shouldn't be penalized for not inventing an
  // agency, and vice versa for an org owner who skips the personal bio.
  const fields: ManagerCompletionField[] = [
    { key: "name", label: "Name", weight: 15, filled: hasText(input.name) },
    { key: "email", label: "Email", weight: 10, filled: hasText(input.email) },
    {
      key: "agencyOrBio",
      label: "Agency or bio",
      weight: 20,
      filled: hasText(input.agencyName) || hasText(input.bio),
    },
    {
      key: "websiteUrl",
      label: "Website",
      weight: 10,
      filled: hasText(input.websiteUrl),
    },
    {
      key: "country",
      label: "Country",
      weight: 10,
      filled: hasText(input.country),
    },
    {
      key: "languages",
      label: "Languages",
      weight: 10,
      filled: (input.languages?.length ?? 0) > 0,
    },
    {
      key: "contactEmail",
      label: "Contact email",
      weight: 10,
      filled: hasText(input.contactEmail),
    },
    {
      key: "roster",
      label: "Active roster",
      weight: 15,
      filled: (input.activeRosterCount ?? 0) > 0,
    },
  ];

  return {
    percentage: fields.reduce(
      (sum, field) => sum + (field.filled ? field.weight : 0),
      0,
    ),
    fields,
  };
}
