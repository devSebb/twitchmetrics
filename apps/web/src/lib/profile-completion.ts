export type ProfileCompletionInput = {
  displayName?: string | null | undefined;
  email?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  country?: string | null | undefined;
  language?: string | null | undefined;
  gender?: string | null | undefined;
  age?: number | null | undefined;
  interests?: readonly string[] | null | undefined;
  bio?: string | null | undefined;
  connectedAccountsCount?: number | null | undefined;
  partnershipsCount?: number | null | undefined;
};

export type ProfileCompletionField = {
  key:
    | "displayName"
    | "email"
    | "avatar"
    | "country"
    | "language"
    | "gender"
    | "age"
    | "interests"
    | "bio"
    | "connectedAccounts"
    | "partnerships";
  label: string;
  weight: number;
  filled: boolean;
};

export type ProfileCompletionResult = {
  percentage: number;
  fields: ProfileCompletionField[];
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function computeProfileCompletion(
  input: ProfileCompletionInput,
): ProfileCompletionResult {
  const fields: ProfileCompletionField[] = [
    {
      key: "displayName",
      label: "Name",
      weight: 10,
      filled: hasText(input.displayName),
    },
    { key: "email", label: "Email", weight: 10, filled: hasText(input.email) },
    {
      key: "avatar",
      label: "Avatar",
      weight: 10,
      filled: hasText(input.avatarUrl),
    },
    {
      key: "country",
      label: "Country",
      weight: 10,
      filled: hasText(input.country),
    },
    {
      key: "language",
      label: "Language",
      weight: 10,
      filled: hasText(input.language),
    },
    {
      key: "gender",
      label: "Gender",
      weight: 5,
      filled: hasText(input.gender),
    },
    {
      key: "age",
      label: "Age",
      weight: 5,
      filled:
        typeof input.age === "number" &&
        Number.isFinite(input.age) &&
        input.age > 0,
    },
    {
      key: "interests",
      label: "Interests",
      weight: 10,
      filled: (input.interests?.length ?? 0) > 0,
    },
    {
      key: "bio",
      label: "Description",
      weight: 10,
      filled: hasText(input.bio),
    },
    {
      key: "connectedAccounts",
      label: "Connected Accounts",
      weight: 15,
      filled: (input.connectedAccountsCount ?? 0) > 0,
    },
    {
      key: "partnerships",
      label: "Partnerships",
      weight: 5,
      filled: (input.partnershipsCount ?? 0) > 0,
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
