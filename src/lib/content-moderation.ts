/**
 * TheHive.ai Content Moderation Integration
 *
 * Automatically screens profile photos and text for:
 * - NSFW content (nudity, sexual content)
 * - Violence and gore
 * - Fake/AI-generated photos
 * - Policy violations
 *
 * Environment variables:
 *   THEHIVE_SECRET_KEY — Hive V3 Secret Key (preferred for image moderation)
 *   THEHIVE_API_KEY — Hive V2 token (legacy, still used for text moderation)
 *   OPENAI_IMAGE_IDENTITY_MODEL — Optional override for OpenAI identity model
 *
 * Usage:
 *   const result = await moderateImage(imageUrl);
 *   if (!result.approved) { // Flag or reject the image }
 *
 *   const textResult = await moderateText(bioText);
 *   if (!textResult.approved) { // Flag the profile }
 */

const THEHIVE_V2_API_URL = "https://api.thehive.ai/api/v2/task/sync";
const THEHIVE_V3_VISUAL_API_URL =
  "https://api.thehive.ai/api/v3/hive/visual-moderation";
const THEHIVE_V3_CHAT_API_URL = "https://api.thehive.ai/api/v3/chat/completions";

type OpenAIHumanPhotoCheck = {
  is_human_photo: boolean;
  is_ai_or_synthetic: boolean;
  is_unrelated_or_non_human: boolean;
  confidence: number;
  human_subject_confidence?: number;
  ai_or_synthetic_confidence?: number;
  unrelated_or_non_human_confidence?: number;
  human_count_estimate?: number;
  primary_subject_is_human?: boolean;
  reason: string;
};

type HiveClassScore = {
  label: string;
  score: number;
};

type HiveVlmIdentityCheck = {
  is_human_photo: boolean;
  is_ai_or_synthetic: boolean;
  is_unrelated_or_non_human: boolean;
  confidence: number;
  reason: string;
};

function isNegativeClassLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.startsWith("no_") ||
    lower.startsWith("not_") ||
    lower.includes("_not_")
  );
}

function isLikelyHiveV3Secret(key: string): boolean {
  // Hive V3 secrets are commonly base64-like and include "/" or "=".
  return /[\/=]/.test(key);
}

function getHiveV3Secret(): string | null {
  const explicitSecret = process.env.THEHIVE_SECRET_KEY?.trim();
  if (explicitSecret) return explicitSecret;

  // Backward compatibility: allow storing V3 secret in THEHIVE_API_KEY.
  const legacyKey = process.env.THEHIVE_API_KEY?.trim();
  if (legacyKey && isLikelyHiveV3Secret(legacyKey)) return legacyKey;

  return null;
}

function getHiveV2Token(): string | null {
  const apiKey = process.env.THEHIVE_API_KEY?.trim();
  if (!apiKey) return null;
  if (isLikelyHiveV3Secret(apiKey)) return null;
  return apiKey;
}

function extractHiveClassScores(payload: unknown): HiveClassScore[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const outputScores: HiveClassScore[] = [];

  const collectScoresFromOutput = (outputs: unknown[]) => {
    for (const outputItem of outputs) {
      if (!outputItem || typeof outputItem !== "object") continue;
      const outputRecord = outputItem as Record<string, unknown>;
      const classes = Array.isArray(outputRecord.classes)
        ? outputRecord.classes
        : [];

      for (const clsItem of classes) {
        if (!clsItem || typeof clsItem !== "object") continue;
        const cls = clsItem as Record<string, unknown>;

        const label =
          typeof cls.class === "string"
            ? cls.class
            : typeof cls.class_name === "string"
              ? cls.class_name
              : "";

        const score =
          typeof cls.score === "number"
            ? cls.score
            : typeof cls.value === "number"
              ? cls.value
              : NaN;

        if (!label || Number.isNaN(score)) continue;
        outputScores.push({ label, score });
      }
    }
  };

  // Hive V3 shape: { output: [{ classes: [...] }] }
  const directOutput = Array.isArray(root.output) ? root.output : [];
  if (directOutput.length > 0) {
    collectScoresFromOutput(directOutput);
  }

  // Hive V2 shape: { status: [{ response: { output: [{ classes: [...] }] } }] }
  const statuses = Array.isArray(root.status) ? root.status : [];
  for (const statusItem of statuses) {
    if (!statusItem || typeof statusItem !== "object") continue;
    const statusRecord = statusItem as Record<string, unknown>;
    const response = statusRecord.response;
    if (!response || typeof response !== "object") continue;
    const responseRecord = response as Record<string, unknown>;
    const outputs = Array.isArray(responseRecord.output)
      ? responseRecord.output
      : [];

    collectScoresFromOutput(outputs);
  }

  return outputScores;
}

function classifyViolationsFromHiveScores(classScores: HiveClassScore[]): {
  violations: string[];
  scores: Record<string, number>;
  action: "approve" | "flag" | "reject";
} {
  const violations: string[] = [];
  const scores: Record<string, number> = {};
  const lowerScores = new Map<string, number>();

  for (const item of classScores) {
    scores[item.label] = item.score;
    const lowerLabel = item.label.toLowerCase();
    const previous = lowerScores.get(lowerLabel);
    if (previous === undefined || item.score > previous) {
      lowerScores.set(lowerLabel, item.score);
    }
  }

  const scoreOf = (label: string) => lowerScores.get(label.toLowerCase()) ?? 0;
  const maxScoreOf = (...labels: string[]) =>
    labels.reduce((max, label) => Math.max(max, scoreOf(label)), 0);

  for (const item of classScores) {
    if (item.score <= 0.7) continue;
    const category = item.label.toLowerCase();

    // Hive labels include both positive and negative classes (e.g. yes_female_nudity / no_female_nudity).
    // Only positive classes should count as violations.
    if (isNegativeClassLabel(category)) continue;

    if (
      category.includes("sexual") ||
      category.includes("nudity") ||
      category.includes("gore") ||
      category.includes("violence") ||
      category.includes("drugs") ||
      category.includes("hate") ||
      category.includes("self_harm")
    ) {
      violations.push(item.label);
    }
  }

  // Add normalized identity-related scores consumed by strict photo moderation logic.
  const animatedScore = maxScoreOf("animated", "yes_drawing", "hybrid");
  const textOnlyScore = maxScoreOf("text", "yes_overlay_text");
  const explicitHumanScore = maxScoreOf(
    "person",
    "human",
    "face",
    "portrait",
    "selfie",
    "man",
    "woman",
    "male",
    "female",
    "yes_child_present"
  );
  scores.ai_or_synthetic = Math.max(
    animatedScore,
    maxScoreOf("ai_generated", "synthetic", "deepfake")
  );
  scores.unrelated_or_non_human = Math.max(
    textOnlyScore,
    maxScoreOf("yes_drawing", "animated"),
    maxScoreOf("animal_genitalia_only", "yes_animal_abuse")
  );
  if (explicitHumanScore > 0) {
    scores.human_photo = explicitHumanScore;
  }

  let action: "approve" | "flag" | "reject" = "approve";
  if (violations.length > 0) {
    const hasHardReject = violations.some((v) => {
      const lower = v.toLowerCase();
      return (
        lower.includes("sexual_activity") ||
        lower.includes("nudity") ||
        lower.includes("gore")
      );
    });
    action = hasHardReject ? "reject" : "flag";
  }

  return { violations, scores, action };
}

function mergeModerationResults(
  base: ImageModerationResult,
  overlay: ImageModerationResult
): ImageModerationResult {
  const mergedScores: Record<string, number> = {
    ...base.scores,
    ...overlay.scores,
  };
  const mergedViolations = Array.from(
    new Set([...base.violations, ...overlay.violations])
  );

  const action: "approve" | "flag" | "reject" =
    base.action === "reject" || overlay.action === "reject"
      ? "reject"
      : base.action === "flag" || overlay.action === "flag"
        ? "flag"
        : "approve";

  return {
    approved: action === "approve",
    action,
    violations: mergedViolations,
    scores: mergedScores,
  };
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") {
        chunks.push(partRecord.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractHiveChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice =
    choices.length > 0 && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    firstChoice && firstChoice.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;
  return typeof message?.content === "string" ? message.content.trim() : "";
}

function toScore01(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(1, value));
}

async function moderateImageIdentityWithHiveVlm(
  imageUrl: string
): Promise<ImageModerationResult | null> {
  const hiveV3Secret = getHiveV3Secret();
  if (!hiveV3Secret) return null;

  try {
    const response = await fetch(THEHIVE_V3_CHAT_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hiveV3Secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "hive/vision-language-model",
        max_tokens: 160,
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                is_human_photo: { type: "boolean" },
                is_ai_or_synthetic: { type: "boolean" },
                is_unrelated_or_non_human: { type: "boolean" },
                confidence: { type: "number" },
                reason: { type: "string" },
              },
              required: [
                "is_human_photo",
                "is_ai_or_synthetic",
                "is_unrelated_or_non_human",
                "confidence",
                "reason",
              ],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Classify this image for dating profile identity moderation.",
                  "A valid real-human photo can show a clear face OR a full human body.",
                  "Reject food-only, object-only, scenery-only, pet-only, logos/screenshots, and AI/synthetic images.",
                  "Return strict JSON only.",
                ].join(" "),
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        "[TheHive VLM] identity request failed:",
        response.status,
        body.slice(0, 220)
      );
      return null;
    }

    const data = (await response.json().catch(() => null)) as unknown;
    const outputText = extractHiveChatCompletionText(data);
    if (!outputText) return null;

    const jsonText = extractFirstJsonObject(outputText);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as Partial<HiveVlmIdentityCheck>;
    const isHumanPhoto = parsed.is_human_photo === true;
    const isAiSynthetic = parsed.is_ai_or_synthetic === true;
    const isUnrelated = parsed.is_unrelated_or_non_human === true;
    const confidence = toScore01(parsed.confidence) ?? 0;

    const violations: string[] = [];
    if (isAiSynthetic) violations.push("ai_or_synthetic");
    if (isUnrelated) violations.push("unrelated_or_non_human");
    if (!isHumanPhoto) violations.push("human_subject_not_detected");

    const approved = isHumanPhoto && !isAiSynthetic && !isUnrelated;
    const scores: Record<string, number> = {
      human_photo: isHumanPhoto ? Math.max(confidence, 0.5) : 0,
      ai_or_synthetic: isAiSynthetic ? Math.max(confidence, 0.55) : 0,
      unrelated_or_non_human: isUnrelated ? Math.max(confidence, 0.55) : 0,
    };

    return {
      approved,
      violations: approved ? [] : violations,
      scores,
      action: approved ? "approve" : "reject",
    };
  } catch (error) {
    console.error("[TheHive VLM] identity moderation failed:", error);
    return null;
  }
}

async function moderateImageWithOpenAI(
  imageUrl: string
): Promise<ImageModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const configuredModel = process.env.OPENAI_IMAGE_IDENTITY_MODEL?.trim();
  const modelCandidates = Array.from(
    new Set(
      [
        configuredModel || "gpt-5.2",
        "gpt-5-mini",
        "gpt-4.1",
        "gpt-4.1-mini",
      ].filter(Boolean)
    )
  );

  const prompt = `Classify this image for a dating profile moderation policy.
Return STRICT JSON only with keys:
is_human_photo (boolean),
is_ai_or_synthetic (boolean),
is_unrelated_or_non_human (boolean),
confidence (number 0..1),
human_subject_confidence (number 0..1),
ai_or_synthetic_confidence (number 0..1),
unrelated_or_non_human_confidence (number 0..1),
human_count_estimate (integer 0..10),
primary_subject_is_human (boolean),
reason (short string).

Rules:
- ACCEPT when at least one real human is clearly visible (face OR full body is acceptable) and the primary subject is that human.
- REJECT images that are AI-generated/synthetic, food-only, object-only, pet-only, landscape-only, meme/logo/screenshot/text-heavy, or otherwise not a real human profile photo.
- If uncertain, do not assume the image is synthetic or non-human unless there is clear evidence. Use lower confidence values for ambiguous cases.`;

  const shouldFallbackToNextModel = (status: number, body: string): boolean => {
    if (status === 404) return true;
    if (status !== 400 && status !== 403) return false;
    return /model|unsupported|not found|does not exist|do not have access|not available/i.test(
      body
    );
  };

  for (const model of modelCandidates) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_output_tokens: 180,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                { type: "input_image", image_url: imageUrl },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        if (shouldFallbackToNextModel(response.status, body)) {
          console.warn(
            `[OpenAI] model unavailable for identity moderation (${model}); trying fallback`,
            response.status
          );
          continue;
        }
        console.error(
          `[OpenAI] image moderation request failed (${model}):`,
          response.status,
          body.slice(0, 240)
        );
        continue;
      }

      const data = (await response.json().catch(() => null)) as unknown;
      const outputText = extractOutputText(data);
      if (!outputText) {
        console.error(
          `[OpenAI] image moderation returned empty output (${model})`
        );
        continue;
      }

      const jsonText = extractFirstJsonObject(outputText);
      if (!jsonText) {
        console.error(
          `[OpenAI] image moderation did not return JSON payload (${model})`
        );
        continue;
      }

      const parsed = JSON.parse(jsonText) as Partial<OpenAIHumanPhotoCheck>;
      const isHumanPhoto = parsed.is_human_photo === true;
      const isAiSynthetic = parsed.is_ai_or_synthetic === true;
      const isUnrelated = parsed.is_unrelated_or_non_human === true;
      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0;
      const humanScoreRaw =
        typeof parsed.human_subject_confidence === "number"
          ? Math.max(0, Math.min(1, parsed.human_subject_confidence))
          : null;
      const aiScoreRaw =
        typeof parsed.ai_or_synthetic_confidence === "number"
          ? Math.max(0, Math.min(1, parsed.ai_or_synthetic_confidence))
          : null;
      const unrelatedScoreRaw =
        typeof parsed.unrelated_or_non_human_confidence === "number"
          ? Math.max(0, Math.min(1, parsed.unrelated_or_non_human_confidence))
          : null;
      const humanCountEstimate =
        typeof parsed.human_count_estimate === "number"
          ? Math.max(0, Math.min(10, Math.round(parsed.human_count_estimate)))
          : null;
      const primarySubjectIsHuman = parsed.primary_subject_is_human === true;

      const resolvedIsHumanPhoto =
        isHumanPhoto && (humanCountEstimate === null || humanCountEstimate >= 1);
      const resolvedIsUnrelated =
        isUnrelated ||
        humanCountEstimate === 0 ||
        (parsed.primary_subject_is_human === false);

      const violations: string[] = [];
      if (isAiSynthetic) violations.push("ai_or_synthetic");
      if (resolvedIsUnrelated) violations.push("unrelated_or_non_human");
      if (!resolvedIsHumanPhoto) violations.push("human_subject_not_detected");

      const approved =
        resolvedIsHumanPhoto &&
        !isAiSynthetic &&
        !resolvedIsUnrelated &&
        (primarySubjectIsHuman ||
          humanCountEstimate === null ||
          humanCountEstimate >= 1);
      const resolvedHumanScore =
        humanScoreRaw ?? (confidence > 0 ? confidence : 0.8);
      const scores: Record<string, number> = {
        human_photo: resolvedIsHumanPhoto ? resolvedHumanScore : 0,
        ai_or_synthetic: isAiSynthetic
          ? aiScoreRaw ?? Math.max(confidence, 0.6)
          : aiScoreRaw ?? 0,
        unrelated_or_non_human: resolvedIsUnrelated
          ? unrelatedScoreRaw ?? Math.max(confidence, 0.6)
          : unrelatedScoreRaw ?? 0,
      };

      return {
        approved,
        violations: approved ? [] : violations,
        scores,
        action: approved ? "approve" : "reject",
      };
    } catch (error) {
      console.error("[OpenAI] image moderation fallback failed:", error);
    }
  }

  return null;
}

async function runIdentityModerationEnsemble(
  imageUrl: string
): Promise<ImageModerationResult | null> {
  const [hiveIdentity, openaiIdentity] = await Promise.all([
    moderateImageIdentityWithHiveVlm(imageUrl),
    moderateImageWithOpenAI(imageUrl),
  ]);

  if (!hiveIdentity && !openaiIdentity) return null;

  const sources = [
    { name: "hive_vlm", weight: 0.55, result: hiveIdentity },
    { name: "openai", weight: 0.45, result: openaiIdentity },
  ].filter(
    (item): item is { name: string; weight: number; result: ImageModerationResult } =>
      !!item.result
  );

  if (sources.length === 0) return null;

  const totalWeight = sources.reduce((sum, item) => sum + item.weight, 0);
  const weighted = (scoreKey: string) =>
    sources.reduce(
      (sum, item) => sum + (item.result.scores[scoreKey] || 0) * item.weight,
      0
    ) / Math.max(totalWeight, 1);

  const humanScore = weighted("human_photo");
  const aiScore = weighted("ai_or_synthetic");
  const nonHumanScore = weighted("unrelated_or_non_human");

  const strongestHuman = Math.max(
    ...sources.map((item) => item.result.scores.human_photo || 0)
  );
  const strongestNonHuman = Math.max(
    ...sources.map((item) =>
      Math.max(
        item.result.scores.ai_or_synthetic || 0,
        item.result.scores.unrelated_or_non_human || 0
      )
    )
  );

  const scores: Record<string, number> = {
    human_photo: humanScore,
    ai_or_synthetic: aiScore,
    unrelated_or_non_human: nonHumanScore,
  };
  const violations: string[] = [];

  const identityRisk = Math.max(aiScore, nonHumanScore, strongestNonHuman);
  const identityHuman = Math.max(humanScore, strongestHuman);
  const riskIsHigh = identityRisk >= 0.68;
  const humanIsStrong = identityHuman >= 0.54;
  const humanBeatsRisk = identityHuman > identityRisk + 0.08;

  if (riskIsHigh && !(humanIsStrong && humanBeatsRisk)) {
    violations.push(aiScore >= nonHumanScore ? "ai_or_synthetic" : "unrelated_or_non_human");
  }

  const humanLikely =
    identityHuman >= 0.3 ||
    (identityHuman >= 0.24 && identityRisk < 0.42);

  if (!humanLikely) {
    violations.push("human_subject_not_detected");
  }

  const dedupedViolations = Array.from(new Set(violations));
  const approved = dedupedViolations.length === 0;

  return {
    approved,
    violations: dedupedViolations,
    scores,
    action: approved ? "approve" : "reject",
  };
}

// ---------------------------------------------------------------
// Image Moderation
// ---------------------------------------------------------------
export interface ImageModerationResult {
  approved: boolean;
  /** Array of detected violations */
  violations: string[];
  /** Raw confidence scores per category */
  scores: Record<string, number>;
  /** Suggested action: "approve", "flag", or "reject" */
  action: "approve" | "flag" | "reject";
}

/**
 * Moderate an image URL through TheHive.ai visual moderation.
 * Returns whether the image should be approved, flagged for review, or rejected.
 */
export async function moderateImage(
  imageUrl: string
): Promise<ImageModerationResult> {
  const hiveV3Secret = getHiveV3Secret();
  const hiveV2Token = getHiveV2Token();

  // If no TheHive credentials, try OpenAI fallback.
  if (!hiveV3Secret && !hiveV2Token) {
    const openaiFallback = await moderateImageWithOpenAI(imageUrl);
    if (openaiFallback) return openaiFallback;
    console.warn(
      "[Moderation] No Hive credentials and OpenAI fallback unavailable."
    );
    return { approved: true, violations: [], scores: {}, action: "approve" };
  }

  const attemptV3 = async (): Promise<ImageModerationResult | null> => {
    if (!hiveV3Secret) return null;

    const response = await fetch(THEHIVE_V3_VISUAL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hiveV3Secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [{ media_url: imageUrl }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Hive V3 HTTP ${response.status}: ${body.slice(0, 180)}`);
    }

    const data = (await response.json().catch(() => null)) as unknown;
    const classScores = extractHiveClassScores(data);
    if (classScores.length === 0) return null;
    const normalized = classifyViolationsFromHiveScores(classScores);
    let result: ImageModerationResult = {
      approved: normalized.action === "approve",
      violations: normalized.violations,
      scores: normalized.scores,
      action: normalized.action,
    };
    const identityOverlay = await runIdentityModerationEnsemble(imageUrl);
    if (identityOverlay) {
      result = mergeModerationResults(result, identityOverlay);
    }
    return result;
  };

  const attemptV2 = async (): Promise<ImageModerationResult | null> => {
    if (!hiveV2Token) return null;

    const response = await fetch(THEHIVE_V2_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${hiveV2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Hive V2 HTTP ${response.status}: ${body.slice(0, 180)}`);
    }

    const data = (await response.json().catch(() => null)) as unknown;
    const classScores = extractHiveClassScores(data);
    if (classScores.length === 0) return null;
    const normalized = classifyViolationsFromHiveScores(classScores);
    let result: ImageModerationResult = {
      approved: normalized.action === "approve",
      violations: normalized.violations,
      scores: normalized.scores,
      action: normalized.action,
    };
    const identityOverlay = await runIdentityModerationEnsemble(imageUrl);
    if (identityOverlay) {
      result = mergeModerationResults(result, identityOverlay);
    }
    return result;
  };

  try {
    const v3Result = await attemptV3();
    if (v3Result) return v3Result;

    const v2Result = await attemptV2();
    if (v2Result) return v2Result;
  } catch (error) {
    console.error("[TheHive] Image moderation failed:", error);
  }

  const identityOnly = await runIdentityModerationEnsemble(imageUrl);
  if (identityOnly) return identityOnly;

  // Fail open here; strict human enforcement layer decides final outcome.
  return { approved: true, violations: [], scores: {}, action: "approve" };
}

// ---------------------------------------------------------------
// Text Moderation
// ---------------------------------------------------------------
export interface TextModerationResult {
  approved: boolean;
  violations: string[];
  action: "approve" | "flag" | "reject";
}

/**
 * Moderate text content (bio, messages) for policy violations.
 */
export async function moderateText(
  text: string
): Promise<TextModerationResult> {
  const apiKey = getHiveV2Token();

  if (!apiKey) {
    console.warn(
      "[TheHive] No Hive V2 token configured for text moderation — auto-approving text"
    );
    return { approved: true, violations: [], action: "approve" };
  }

  if (!text || text.trim().length === 0) {
    return { approved: true, violations: [], action: "approve" };
  }

  try {
    const response = await fetch(THEHIVE_V2_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text_data: text,
      }),
    });

    const data = await response.json();

    if (!data.status || data.status.length === 0) {
      return { approved: true, violations: [], action: "approve" };
    }

    const result = data.status[0]?.response;
    if (!result) {
      return { approved: true, violations: [], action: "approve" };
    }

    const violations: string[] = [];

    for (const output of result.output || []) {
      for (const cls of output.classes || []) {
        if (cls.score > 0.7) {
          const category = cls.class.toLowerCase();
          if (
            category.includes("hate") ||
            category.includes("harassment") ||
            category.includes("sexual") ||
            category.includes("violence") ||
            category.includes("spam") ||
            category.includes("self_harm")
          ) {
            violations.push(cls.class);
          }
        }
      }
    }

    return {
      approved: violations.length === 0,
      violations,
      action: violations.length > 0 ? "flag" : "approve",
    };
  } catch (error) {
    console.error("[TheHive] Text moderation failed:", error);
    return { approved: true, violations: [], action: "approve" };
  }
}
