/**
 * Predefined reactivation reasons (26 options)
 */
export const REACTIVATION_REASONS = [
  {
    id: 1,
    label: "Relationship ended",
    description: "The relationship with my matched partner has ended"
  },
  {
    id: 2,
    label: "Taking a break",
    description: "I need some time away but want to return later"
  },
  {
    id: 3,
    label: "Not ready",
    description: "I wasn't ready for this commitment"
  },
  {
    id: 4,
    label: "Didn't feel the connection",
    description: "The connection wasn't strong enough"
  },
  {
    id: 5,
    label: "Incompatible goals",
    description: "Our future goals don't align"
  },
  {
    id: 6,
    label: "Communication issues",
    description: "We had difficulty communicating"
  },
  {
    id: 7,
    label: "Different lifestyles",
    description: "Our lifestyles are too different"
  },
  {
    id: 8,
    label: "Personal circumstances changed",
    description: "Something in my personal life changed"
  },
  {
    id: 9,
    label: "Health reasons",
    description: "I need to focus on my health"
  },
  {
    id: 10,
    label: "Work commitments",
    description: "Work is taking too much of my time"
  },
  {
    id: 11,
    label: "Family obligations",
    description: "Family matters need my attention"
  },
  {
    id: 12,
    label: "Realized I'm not suited for this",
    description: "The dating app isn't for me"
  },
  {
    id: 13,
    label: "Want to explore other options",
    description: "I'd like to try different things"
  },
  {
    id: 14,
    label: "Lost interest",
    description: "I've lost interest in online dating"
  },
  {
    id: 15,
    label: "Too much pressure",
    description: "The process feels too pressured"
  },
  {
    id: 16,
    label: "Privacy concerns",
    description: "I have privacy or safety concerns"
  },
  {
    id: 17,
    label: "Met someone else",
    description: "I met someone outside the app"
  },
  {
    id: 18,
    label: "Unsure about commitment",
    description: "I'm unsure about committing to a relationship"
  },
  {
    id: 19,
    label: "Temporary deactivation",
    description: "I just needed a temporary break"
  },
  {
    id: 20,
    label: "App not meeting expectations",
    description: "The platform didn't meet my expectations"
  },
  {
    id: 21,
    label: "Technical issues",
    description: "I experienced technical problems"
  },
  {
    id: 22,
    label: "Relocation",
    description: "I've moved to a different location"
  },
  {
    id: 23,
    label: "Relationship progressed offline",
    description: "Our relationship moved offline"
  },
  {
    id: 24,
    label: "Felt mismatched",
    description: "We weren't compatible as partners"
  },
  {
    id: 25,
    label: "Unexpected circumstances",
    description: "Something unexpected happened"
  },
  {
    id: 26,
    label: "Other",
    description: "Something not listed above"
  }
];

/**
 * Get reason by ID
 */
export function getReactivationReasonById(id: number | string) {
  const reasonId = typeof id === "string" ? parseInt(id) : id;
  return REACTIVATION_REASONS.find(r => r.id === reasonId);
}

/**
 * Validate custom reason word count
 */
export function validateCustomReason(text: string, minWords: number = 200): boolean {
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return wordCount >= minWords;
}

/**
 * Get word count of text
 */
export function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
