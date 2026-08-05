import type { FeedbackCategoryType, PriorityLevel, GranularRatings } from '../types/feedback';

export interface FeedbackDraft {
  categoryId: FeedbackCategoryType;
  priority: PriorityLevel;
  title: string;
  description: string;
  reproductionSteps: string;
  expectedBehavior: string;
  actualBehavior: string;
  ratings: GranularRatings;
  savedAt: string;
}

const DRAFT_KEY = 'note_standard_feedback_draft_v2';

export function saveFeedbackDraft(draft: Omit<FeedbackDraft, 'savedAt'>): void {
  try {
    const payload: FeedbackDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[FeedbackDraft] Failed to save draft:', err);
  }
}

export function loadFeedbackDraft(): FeedbackDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FeedbackDraft;
  } catch (err) {
    console.warn('[FeedbackDraft] Failed to load draft:', err);
    return null;
  }
}

export function clearFeedbackDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    console.warn('[FeedbackDraft] Failed to clear draft:', err);
  }
}
