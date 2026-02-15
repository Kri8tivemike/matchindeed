/**
 * Form Auto-Save Utility
 * 
 * Provides auto-save functionality for forms using localStorage
 * to prevent data loss if the user's system crashes or loses power.
 */

/**
 * Save form data to localStorage
 */
export function saveFormDraft(formKey: string, data: any): void {
  try {
    const key = `form_draft_${formKey}`;
    const timestamp = new Date().toISOString();
    const draftData = {
      data,
      timestamp,
    };
    localStorage.setItem(key, JSON.stringify(draftData));
  } catch (error) {
    console.error("Error saving form draft:", error);
  }
}

/**
 * Load form data from localStorage
 */
export function loadFormDraft<T>(formKey: string): T | null {
  try {
    const key = `form_draft_${formKey}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const draftData = JSON.parse(stored);
    
    // Check if draft is older than 30 days (optional cleanup)
    const draftDate = new Date(draftData.timestamp);
    const daysSinceDraft = (Date.now() - draftDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDraft > 30) {
      localStorage.removeItem(key);
      return null;
    }

    return draftData.data as T;
  } catch (error) {
    console.error("Error loading form draft:", error);
    return null;
  }
}

/**
 * Clear form draft from localStorage
 */
export function clearFormDraft(formKey: string): void {
  try {
    const key = `form_draft_${formKey}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Error clearing form draft:", error);
  }
}

/**
 * Check if a draft exists
 */
export function hasFormDraft(formKey: string): boolean {
  try {
    const key = `form_draft_${formKey}`;
    return localStorage.getItem(key) !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get draft timestamp
 */
export function getDraftTimestamp(formKey: string): string | null {
  try {
    const key = `form_draft_${formKey}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const draftData = JSON.parse(stored);
    return draftData.timestamp;
  } catch (error) {
    return null;
  }
}
