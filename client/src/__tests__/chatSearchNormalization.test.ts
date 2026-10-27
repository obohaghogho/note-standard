import { describe, it, expect } from 'vitest';
import { normalizeSearchResults } from '../utils/chatSearch';
import type { Message } from '../context/ChatContext';

describe('normalizeSearchResults', () => {
  const dummyMessage1: Message = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    content: 'Hello world',
    created_at: '2026-10-27T10:00:00.000Z'
  } as Message;

  const dummyMessage2: Message = {
    id: 'msg-2',
    conversation_id: 'conv-1',
    sender_id: 'user-2',
    content: 'Search query match',
    created_at: '2026-10-27T10:01:00.000Z'
  } as Message;

  it('case 1: returns legacy array response as an array', () => {
    const rawLegacyData = [dummyMessage1, dummyMessage2];
    const result = normalizeSearchResults(rawLegacyData);
    expect(result).toBe(rawLegacyData);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(dummyMessage1);
  });

  it('case 2: returns messages array from an object with a valid messages property', () => {
    const activeServerResponse = {
      success: true,
      query: 'match',
      messages: [dummyMessage2],
      total: 1
    };
    const result = normalizeSearchResults(activeServerResponse);
    expect(result).toBe(activeServerResponse.messages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(dummyMessage2);
  });

  it('case 3: returns an empty array when payload is null', () => {
    const result = normalizeSearchResults(null);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('case 4: returns an empty array when object has no messages property', () => {
    const missingMessagesResponse = {
      success: true,
      query: 'hello',
      total: 0
    };
    const result = normalizeSearchResults(missingMessagesResponse);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('case 5: returns an empty array when messages property is not an array', () => {
    const invalidMessagesResponse = {
      success: false,
      messages: 'invalid string instead of array'
    };
    const result = normalizeSearchResults(invalidMessagesResponse);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);

    const numericMessagesResponse = {
      success: true,
      messages: 42
    };
    expect(normalizeSearchResults(numericMessagesResponse)).toEqual([]);

    const nullMessagesResponse = {
      success: true,
      messages: null
    };
    expect(normalizeSearchResults(nullMessagesResponse)).toEqual([]);
  });

  it('case 6: returns an empty array when messages is an empty array', () => {
    const emptyMessagesResponse = {
      success: true,
      query: 'nonexistent',
      messages: [],
      total: 0
    };
    const result = normalizeSearchResults(emptyMessagesResponse);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});
