/**
 * Community Service — NoteStandard
 * Centralises all community API interactions.
 * Reuses API_URL / getAuthHeader from existing infrastructure.
 * Never introduces duplicate service patterns.
 */

import { API_URL, getAuthHeader } from '../lib/api';

export interface CommunityPost {
  id: string;
  author_id: string;
  space_id?: string | null;
  title?: string;
  content?: string;
  post_type: 'text' | 'article' | 'image' | 'video' | 'audio' | 'code' | 'poll' | 'question' | 'link' | 'checklist';
  category: string;
  tags: string[];
  status: string;
  is_pinned: boolean;
  views_count: number;
  saves_count: number;
  shares_count: number;
  likes_count?: number;
  comments_count?: number;
  media_urls: string[];
  poll_options?: unknown;
  link_url?: string;
  code_language?: string;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: {
    id: string;
    username: string;
    avatar_url?: string;
    is_verified?: boolean;
    followers_count?: number;
  };
  community_likes?: { user_id: string }[];
  community_bookmarks?: { user_id: string }[];
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  likes_count: number;
  is_edited: boolean;
  created_at: string;
  profiles?: {
    id: string;
    username: string;
    avatar_url?: string;
    is_verified?: boolean;
  };
  replies?: CommunityComment[];
}

export interface FeedResult {
  posts: CommunityPost[];
  nextCursor?: string;
  hasMore: boolean;
}

// ─── Offline Action Queue ──────────────────────────────────────────────────────
const QUEUE_KEY = 'community_action_queue';

interface OfflineAction {
  id: string;
  type: 'like' | 'unlike' | 'bookmark' | 'unbookmark' | 'comment' | 'follow' | 'unfollow' | 'vote';
  payload: Record<string, unknown>;
  timestamp: number;
}

export function queueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>) {
  try {
    const queue: OfflineAction[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    queue.push({ ...action, id: crypto.randomUUID(), timestamp: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* noop */ }
}

export async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  let queue: OfflineAction[] = [];
  try {
    queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (queue.length === 0) return;
  } catch { return; }

  const remaining: OfflineAction[] = [];

  for (const action of queue) {
    try {
      switch (action.type) {
        case 'like':
          await toggleLike(action.payload.postId as string);
          break;
        case 'bookmark':
          await toggleBookmark(action.payload.postId as string);
          break;
        case 'comment':
          await addComment(action.payload as { postId: string; content: string; parentId?: string });
          break;
        case 'follow':
          await toggleFollow(action.payload.profileId as string);
          break;
        case 'vote':
          await votePollOption(action.payload.postId as string, action.payload.optionId as string);
          break;
      }
    } catch {
      remaining.push(action);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

// ─── Feed Cache ────────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'community_feed_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedFeed(key: string): FeedResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

export function setCachedFeed(key: string, data: FeedResult) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* noop - storage full */ }
}

// ─── API Helpers ───────────────────────────────────────────────────────────────
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeader();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(options.headers || {}),
    },
  });
}

// ─── Feed ──────────────────────────────────────────────────────────────────────
export async function getFeed(params: {
  tab?: string;
  category?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
  search?: string;
}): Promise<FeedResult> {
  const q = new URLSearchParams();
  if (params.tab) q.set('tab', params.tab);
  if (params.category) q.set('category', params.category);
  if (params.sort) q.set('sort', params.sort);
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);

  const res = await authFetch(`${API_URL}/api/community/feed?${q.toString()}`);
  if (!res.ok) throw new Error(`Feed error ${res.status}`);
  return res.json();
}

// ─── Post CRUD ─────────────────────────────────────────────────────────────────
export async function createPost(payload: {
  title?: string;
  content?: string;
  post_type?: string;
  category?: string;
  tags?: string[];
  status?: string;
  media_urls?: string[];
  poll_options?: unknown;
  link_url?: string;
  space_id?: string;
}): Promise<CommunityPost> {
  const res = await authFetch(`${API_URL}/api/community/post`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Create post failed (${res.status})`);
  }
  return res.json();
}

export async function editPost(postId: string, updates: { title?: string; content?: string }): Promise<CommunityPost> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Edit post failed (${res.status})`);
  return res.json();
}

export async function deletePost(postId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete post failed (${res.status})`);
}

// ─── Interactions ──────────────────────────────────────────────────────────────
export async function toggleLike(postId: string): Promise<{ liked: boolean }> {
  const res = await authFetch(`${API_URL}/api/community/like`, {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
  if (!res.ok) throw new Error(`Like failed (${res.status})`);
  return res.json();
}

export async function toggleBookmark(postId: string): Promise<{ bookmarked: boolean }> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}/bookmark`, { method: 'POST' });
  if (!res.ok) throw new Error(`Bookmark failed (${res.status})`);
  return res.json();
}

export async function toggleFollow(profileId: string): Promise<{ following: boolean }> {
  const res = await authFetch(`${API_URL}/api/community/profile/${profileId}/follow`, { method: 'POST' });
  if (!res.ok) throw new Error(`Follow failed (${res.status})`);
  return res.json();
}

export async function votePollOption(postId: string, optionId: string): Promise<{ optionId: string; votes_count: number }> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}/poll/${optionId}/vote`, { method: 'POST' });
  if (!res.ok) throw new Error(`Vote failed (${res.status})`);
  return res.json();
}

// ─── Comments ──────────────────────────────────────────────────────────────────
export async function getComments(postId: string): Promise<CommunityComment[]> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}/comments`);
  if (!res.ok) throw new Error(`Get comments failed (${res.status})`);
  return res.json();
}

export async function addComment(payload: { postId: string; content: string; parentId?: string }): Promise<CommunityComment> {
  const res = await authFetch(`${API_URL}/api/community/comment`, {
    method: 'POST',
    body: JSON.stringify({ postId: payload.postId, content: payload.content, parentId: payload.parentId }),
  });
  if (!res.ok) throw new Error(`Add comment failed (${res.status})`);
  return res.json();
}

export async function editComment(commentId: string, content: string): Promise<CommunityComment> {
  const res = await authFetch(`${API_URL}/api/community/comment/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Edit comment failed (${res.status})`);
  return res.json();
}

export async function deleteComment(commentId: string): Promise<void> {
  const res = await authFetch(`${API_URL}/api/community/comment/${commentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete comment failed (${res.status})`);
}

// ─── Reporting ─────────────────────────────────────────────────────────────────
export async function reportItem(payload: { postId?: string; commentId?: string; reason: string }): Promise<void> {
  const res = await authFetch(`${API_URL}/api/community/report`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
}

// ─── Media Upload ──────────────────────────────────────────────────────────────
export async function uploadMediaFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const headers = await getAuthHeader();
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/media/upload`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).url); }
        catch { reject(new Error('Invalid upload response')); }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(formData);
  });
}
