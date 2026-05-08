export const PERSONALITY_PROMPT_MIN_LENGTH = 30;
export const PERSONALITY_PROMPT_MAX_LENGTH = 200;
export const PERSONALITY_PROMPT_REQUIRED_COUNT = 3;

export const PERSONALITY_PROMPT_CONFIGS = [
  {
    id: "ideal_weekend",
    title: "My ideal weekend…",
    shortLabel: "Ideal weekend",
    samples: [
      "Relaxing, cooking, and spending time with someone special.",
      "A mix of rest, good food, and meaningful conversations.",
      "Exploring new places or enjoying a peaceful day at home.",
    ],
  },
  {
    id: "green_flag",
    title: "A green flag about me is…",
    shortLabel: "Green flag",
    samples: [
      "I communicate clearly and respectfully.",
      "I’m consistent — my actions match my words.",
      "I value emotional safety and honesty.",
    ],
  },
  {
    id: "looking_for_partner",
    title: "I’m looking for a partner who…",
    shortLabel: "Looking for",
    samples: [
      "Values commitment, honesty, and emotional maturity.",
      "Wants a serious relationship that leads to marriage.",
      "Communicates openly and shows genuine effort.",
    ],
  },
] as const;

export type PersonalityPromptId = (typeof PERSONALITY_PROMPT_CONFIGS)[number]["id"];

export type PersonalityPromptEntry = {
  id: PersonalityPromptId;
  title: string;
  answer: string;
};

type StoredPersonalityPrompts = {
  version: 1;
  prompts: PersonalityPromptEntry[];
};

const promptConfigById = new Map(
  PERSONALITY_PROMPT_CONFIGS.map((config) => [config.id, config])
);

export function createEmptyPersonalityPromptMap(): Record<PersonalityPromptId, string> {
  return PERSONALITY_PROMPT_CONFIGS.reduce((acc, config) => {
    acc[config.id] = "";
    return acc;
  }, {} as Record<PersonalityPromptId, string>);
}

export function parseStoredPersonalityPrompts(
  value: string | null | undefined
): PersonalityPromptEntry[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as StoredPersonalityPrompts;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.prompts)) {
      return [];
    }

    const normalizedPrompts = parsed.prompts.reduce<PersonalityPromptEntry[]>(
      (acc, prompt) => {
        const id = typeof prompt?.id === "string" ? prompt.id : "";
        const config = promptConfigById.get(id as PersonalityPromptId);
        const answer = typeof prompt?.answer === "string" ? prompt.answer.trim() : "";

        if (!config || !answer) return acc;

        acc.push({
          id: config.id,
          title: config.title,
          answer,
        });

        return acc;
      },
      []
    );

    return normalizedPrompts;
  } catch {
    return [];
  }
}

export function serializeStoredPersonalityPrompts(
  prompts: PersonalityPromptEntry[]
): string {
  return JSON.stringify({
    version: 1,
    prompts,
  } satisfies StoredPersonalityPrompts);
}

export function buildPersonalityPromptMap(
  value: string | null | undefined
): Record<PersonalityPromptId, string> {
  const next = createEmptyPersonalityPromptMap();

  for (const prompt of parseStoredPersonalityPrompts(value)) {
    next[prompt.id] = prompt.answer;
  }

  return next;
}

export function countCompletedPersonalityPrompts(
  value: string | null | undefined
): number {
  return parseStoredPersonalityPrompts(value).length;
}

export function getPersonalityPromptPreview(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117).trimEnd()}...`;
}

export function getPersonalityDisplayText(
  value: string | null | undefined
): string | null {
  const prompts = parseStoredPersonalityPrompts(value);
  if (prompts.length > 0) {
    return prompts
      .map((prompt) => `${prompt.title} ${prompt.answer}`)
      .join("\n\n");
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
