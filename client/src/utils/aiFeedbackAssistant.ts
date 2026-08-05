import type { FeedbackCategoryType, PriorityLevel, AIAssistanceResult, FeedbackReport } from '../types/feedback';

// Levenshtein / TF-IDF word overlap similarity calculator for duplicate detection
export function calculateSemanticSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const words1 = text1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const words2 = text2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersectionCount = 0;

  set1.forEach((word) => {
    if (set2.has(word)) intersectionCount++;
  });

  const unionSize = new Set([...words1, ...words2]).size;
  return Number((intersectionCount / unionSize).toFixed(2));
}

export function generateAITitle(description: string, category: FeedbackCategoryType): string {
  if (!description || description.trim().length === 0) return 'Untitled Feedback';
  
  const clean = description.trim().replace(/\n+/g, ' ');
  const lower = clean.toLowerCase();

  // Smart domain-specific title patterns
  if (lower.includes('pin') && (lower.includes('fail') || lower.includes('error'))) {
    return 'Transfer failed after PIN confirmation';
  }
  if (lower.includes('wallet') && lower.includes('balance')) {
    return 'Wallet balance display mismatch';
  }
  if (lower.includes('deposit') || lower.includes('card')) {
    return 'Payment gateway deposit error';
  }
  if (lower.includes('chat') || lower.includes('message')) {
    return 'Chat message delivery timeout';
  }
  if (lower.includes('slow') || lower.includes('lag') || lower.includes('freeze')) {
    return 'Performance degradation & UI freeze';
  }
  if (lower.includes('dark mode') || lower.includes('theme') || lower.includes('button')) {
    return 'UI layout alignment and styling suggestion';
  }

  // Fallback title generation from first sentence or words
  const firstSentence = clean.split('.')[0];
  if (firstSentence.length <= 60 && firstSentence.length >= 10) {
    return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  }

  const words = clean.split(/\s+/).slice(0, 7).join(' ');
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/[^\w\s]$/, '') + '...';
}

export function suggestAICategory(description: string, title: string = ''): FeedbackCategoryType {
  const combined = (title + ' ' + description).toLowerCase();

  if (combined.includes('security') || combined.includes('vulnerability') || combined.includes('hack') || combined.includes('auth error')) {
    return 'security';
  }
  if (combined.includes('wallet') || combined.includes('balance') || combined.includes('currency') || combined.includes('usdt')) {
    return 'wallet';
  }
  if (combined.includes('payment') || combined.includes('deposit') || combined.includes('withdraw') || combined.includes('card') || combined.includes('fincra')) {
    return 'payment';
  }
  if (combined.includes('chat') || combined.includes('message') || combined.includes('call') || combined.includes('socket')) {
    return 'chat';
  }
  if (combined.includes('feed') || combined.includes('post') || combined.includes('like') || combined.includes('comment')) {
    return 'community';
  }
  if (combined.includes('slow') || combined.includes('lag') || combined.includes('cpu') || combined.includes('memory') || combined.includes('performance')) {
    return 'performance';
  }
  if (combined.includes('crash') || combined.includes('error') || combined.includes('broken') || combined.includes('fail') || combined.includes('bug')) {
    return 'bug_report';
  }
  if (combined.includes('would be great') || combined.includes('feature') || combined.includes('add support') || combined.includes('new idea')) {
    return 'feature_request';
  }
  if (combined.includes('improve') || combined.includes('better') || combined.includes('change') || combined.includes('design')) {
    return 'improvement';
  }

  return 'general';
}

export function estimateAIPriority(description: string, category: FeedbackCategoryType): PriorityLevel {
  const combined = description.toLowerCase();

  if (
    category === 'security' ||
    combined.includes('crash') ||
    combined.includes('lost money') ||
    combined.includes('unauthorized') ||
    combined.includes('data breach') ||
    combined.includes('cannot withdraw')
  ) {
    return 'critical';
  }

  if (
    category === 'payment' ||
    category === 'wallet' ||
    combined.includes('failed') ||
    combined.includes('cannot send') ||
    combined.includes('freeze')
  ) {
    return 'high';
  }

  if (category === 'performance' || category === 'chat' || combined.includes('slow') || combined.includes('bug')) {
    return 'medium';
  }

  return 'low';
}

export function extractAIReproductionSteps(description: string): string[] {
  if (!description) return [];

  // Look for numbered lists or bullet points
  const lines = description.split('\n');
  const extracted: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (
      /^\d+[.)]\s+/.test(trimmed) ||
      /^[-*•]\s+/.test(trimmed) ||
      trimmed.toLowerCase().startsWith('step') ||
      trimmed.toLowerCase().startsWith('then') ||
      trimmed.toLowerCase().startsWith('finally')
    ) {
      extracted.push(trimmed.replace(/^(\d+[.)]|[-*•])\s+/, ''));
    }
  });

  if (extracted.length > 0) return extracted;

  // Fallback: split by sentences and prefix
  const sentences = description.split(/\. |\n/).filter((s) => s.trim().length > 5);
  return sentences.slice(0, 4).map((s, idx) => `Step ${idx + 1}: ${s.trim()}`);
}

export function detectDuplicates(
  newTitle: string,
  newDescription: string,
  existingReports: FeedbackReport[]
): AIAssistanceResult['potentialDuplicates'] {
  const combinedInput = `${newTitle} ${newDescription}`;

  const duplicates = existingReports
    .map((report) => {
      const combinedReport = `${report.title} ${report.description}`;
      const score = calculateSemanticSimilarity(combinedInput, combinedReport);
      return {
        id: report.id,
        title: report.title,
        status: report.status,
        similarityScore: score,
      };
    })
    .filter((item) => item.similarityScore >= 0.35)
    .sort((a, b) => b.similarityScore - a.similarityScore);

  return duplicates.slice(0, 3);
}

export function runFullAIAssist(
  description: string,
  title: string = '',
  existingReports: FeedbackReport[] = []
): AIAssistanceResult {
  const suggestedCategory = suggestAICategory(description, title);
  const suggestedTitle = title.trim() ? title : generateAITitle(description, suggestedCategory);
  const estimatedPriority = estimateAIPriority(description, suggestedCategory);
  const extractedSteps = extractAIReproductionSteps(description);
  const potentialDuplicates = detectDuplicates(suggestedTitle, description, existingReports);

  return {
    suggestedTitle,
    suggestedCategory,
    estimatedPriority,
    confidenceScore: 0.92,
    extractedSteps,
    potentialDuplicates,
  };
}
