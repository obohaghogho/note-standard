import type { Message } from '../context/ChatContext';

/**
 * Normalizes chat search API responses into a guaranteed Message array.
 *
 * Supports both legacy raw array responses (`Message[]`) and the active server
 * response format (`{ success: boolean, query: string, messages: Message[], total: number }`).
 * Returns an empty array `[]` for `null`, `undefined`, non-array `messages`, or any malformed container shapes.
 *
 * NOTE: This function validates only the top-level response container shape to prevent runtime
 * exceptions (e.g. `searchResults.map is not a function`). It does not validate or sanitize
 * individual fields of each message object at runtime.
 *
 * @param data - The raw search response data from the API endpoint
 * @returns An array of Message objects
 */
export function normalizeSearchResults(data: unknown): Message[] {
  if (Array.isArray(data)) {
    return data as Message[];
  }

  if (data && typeof data === 'object') {
    const candidate = (data as { messages?: unknown }).messages;
    if (Array.isArray(candidate)) {
      return candidate as Message[];
    }
  }

  return [];
}
