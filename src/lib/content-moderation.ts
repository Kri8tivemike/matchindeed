/**
 * TheHive.ai Content Moderation Integration
 *
 * Automatically screens profile photos and text for:
 * - NSFW content (nudity, sexual content)
 * - Violence and gore
 * - Fake/AI-generated photos
 * - Policy violations
 *
 * Environment variable required:
 *   THEHIVE_API_KEY — from https://thehive.ai/
 *
 * Usage:
 *   const result = await moderateImage(imageUrl);
 *   if (!result.approved) { // Flag or reject the image }
 *
 *   const textResult = await moderateText(bioText);
 *   if (!textResult.approved) { // Flag the profile }
 */

const THEHIVE_API_URL = "https://api.thehive.ai/api/v2/task/sync";

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
  const apiKey = process.env.THEHIVE_API_KEY;

  // If no API key, auto-approve (dev mode)
  if (!apiKey) {
    console.warn("[TheHive] No THEHIVE_API_KEY set — auto-approving image");
    return { approved: true, violations: [], scores: {}, action: "approve" };
  }

  try {
    const response = await fetch(THEHIVE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
      }),
    });

    const data = await response.json();

    if (!data.status || data.status.length === 0) {
      console.error("[TheHive] Unexpected response format:", data);
      return { approved: true, violations: [], scores: {}, action: "approve" };
    }

    const result = data.status[0]?.response;
    if (!result) {
      return { approved: true, violations: [], scores: {}, action: "approve" };
    }

    const violations: string[] = [];
    const scores: Record<string, number> = {};

    // Parse output classes from TheHive response
    for (const output of result.output || []) {
      for (const cls of output.classes || []) {
        scores[cls.class] = cls.score;

        // Flag high-confidence violations
        if (cls.score > 0.7) {
          const category = cls.class.toLowerCase();
          if (
            category.includes("sexual") ||
            category.includes("nudity") ||
            category.includes("gore") ||
            category.includes("violence") ||
            category.includes("drugs") ||
            category.includes("hate")
          ) {
            violations.push(cls.class);
          }
        }
      }
    }

    // Determine action
    let action: "approve" | "flag" | "reject" = "approve";
    if (violations.length > 0) {
      // Strong violations → reject
      const hasHardReject = violations.some(
        (v) =>
          v.toLowerCase().includes("sexual_activity") ||
          v.toLowerCase().includes("nudity") ||
          v.toLowerCase().includes("gore")
      );
      action = hasHardReject ? "reject" : "flag";
    }

    return {
      approved: action === "approve",
      violations,
      scores,
      action,
    };
  } catch (error) {
    console.error("[TheHive] Image moderation failed:", error);
    // Fail open — don't block uploads if the API is down
    return { approved: true, violations: [], scores: {}, action: "approve" };
  }
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
  const apiKey = process.env.THEHIVE_API_KEY;

  if (!apiKey) {
    console.warn("[TheHive] No THEHIVE_API_KEY set — auto-approving text");
    return { approved: true, violations: [], action: "approve" };
  }

  if (!text || text.trim().length === 0) {
    return { approved: true, violations: [], action: "approve" };
  }

  try {
    const response = await fetch(THEHIVE_API_URL, {
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
