/**
 * Community Service — NoteStandard
 * Centralises all community API interactions.
 * Reuses API_URL / getAuthHeader from existing infrastructure.
 * Never introduces duplicate service patterns.
 */

import { API_URL, getAuthHeader } from '../lib/api';
import api from '../api/axiosInstance';
import { supabase } from '../lib/supabase';

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
  /** FK-alias join key returned when the server uses
   *  `author:profiles!author_id(...)` in its select string.
   *  Prefer `profiles` when present; this is a secondary fallback. */
  author?: {
    id?: string;
    username?: string;
    avatar_url?: string;
    is_verified?: boolean;
  };
  community_likes?: { user_id: string }[];
  community_bookmarks?: { user_id: string }[];
  user_has_liked?: boolean;
  user_has_bookmarked?: boolean;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  bookmarked?: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  likes_count: number;
  is_liked?: boolean;
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

import { safeRandomUUID } from '../utils/uuid';

export function queueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>) {
  try {
    const queue: OfflineAction[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    queue.push({ ...action, id: safeRandomUUID(), timestamp: Date.now() });
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
          await toggleLike(
            action.payload.postId as string,
            (action.payload as { postId: string; action?: 'like' | 'unlike' }).action
          );
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

export async function getPostById(postId: string): Promise<CommunityPost> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}`);
  if (!res.ok) throw new Error(`Get post failed (${res.status})`);
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

export async function toggleLike(
  postId: string,
  action?: 'like' | 'unlike'
): Promise<{ liked: boolean }> {
  // 1. Primary: Use resilient Axios API client (handles auth tokens, refresh on 401, retries)
  try {
    const payload = action ? { postId, action } : { postId };
    const res = await api.post<{ liked: boolean }>('/community/like', payload);
    if (res.data && typeof res.data.liked === 'boolean') {
      return res.data;
    }
  } catch (apiErr) {
    console.warn('[CommunityService] API /community/like failed, falling back to direct Supabase operation:', apiErr);
  }

  // 2. Direct Supabase Fallback (ensures liking NEVER fails on network/CORS/preview issues)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Explicit desired-state: like (idempotent upsert, never toggles off)
    if (action === 'like') {
      const { data: existingLike } = await supabase
        .from('community_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingLike) {
        return { liked: true };
      }
      const { error: insErr } = await supabase
        .from('community_likes')
        .upsert(
          [{ post_id: postId, user_id: user.id, reaction: 'like' }],
          { onConflict: 'post_id,user_id' }
        );
      if (insErr && insErr.code !== '23505') throw insErr;
      return { liked: true };
    }

    // Explicit desired-state: unlike (idempotent delete, never toggles on)
    if (action === 'unlike') {
      const { error: delErr } = await supabase
        .from('community_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
      if (delErr) throw delErr;
      return { liked: false };
    }

    // Legacy fallback: toggle behavior when action is omitted
    const { data: existingLike } = await supabase
      .from('community_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingLike) {
      const { error: delErr } = await supabase
        .from('community_likes')
        .delete()
        .eq('id', existingLike.id);
      if (delErr) throw delErr;
      return { liked: false };
    } else {
      const { error: insErr } = await supabase
        .from('community_likes')
        .insert([{ post_id: postId, user_id: user.id, reaction: 'like' }]);
      if (insErr && insErr.code !== '23505') throw insErr;
      return { liked: true };
    }
  } catch (dbErr) {
    console.error('[CommunityService] Direct Supabase toggleLike failed:', dbErr);
    throw dbErr;
  }
}

export interface PostLiker {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  liked_at?: string;
}

export async function getPostLikers(postId: string): Promise<PostLiker[]> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}/likes`);
  if (!res.ok) throw new Error(`Get post likers failed (${res.status})`);
  return res.json();
}

export async function sharePost(postId: string): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/api/community/post/${postId}/share`, { method: 'POST' });
  if (!res.ok) throw new Error(`Share post failed (${res.status})`);
  return res.json();
}

export async function toggleBookmark(postId: string): Promise<{ bookmarked: boolean }> {
  try {
    const res = await api.post<{ bookmarked: boolean }>(`/community/post/${postId}/bookmark`);
    if (res.data && typeof res.data.bookmarked === 'boolean') {
      return res.data;
    }
  } catch (apiErr) {
    console.warn('[CommunityService] API toggleBookmark failed, falling back to Supabase:', apiErr);
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
      .from('community_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('community_bookmarks').delete().eq('id', existing.id);
      return { bookmarked: false };
    } else {
      await supabase.from('community_bookmarks').insert([{ post_id: postId, user_id: user.id }]);
      return { bookmarked: true };
    }
  } catch (dbErr) {
    console.error('[CommunityService] Supabase fallback toggleBookmark failed:', dbErr);
    throw dbErr;
  }
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

export interface ReelViewMetadata {
  watch_duration_seconds?: number;
  is_muted?: boolean;
  completed?: boolean;
  client_event_id?: string;
  session_id?: string;
}

export async function recordReelView(
  reelId: string,
  metadata: ReelViewMetadata = {}
): Promise<{ success: boolean; recorded: boolean; views_count: number }> {
  try {
    const res = await authFetch(`${API_URL}/api/community/reels/${reelId}/view`, {
      method: 'POST',
      body: JSON.stringify({
        watch_duration_seconds: metadata.watch_duration_seconds ?? 2.0,
        is_muted: metadata.is_muted ?? true,
        completed: metadata.completed ?? false,
        client_event_id: metadata.client_event_id,
        session_id: metadata.session_id,
      }),
    });
    if (!res.ok) {
      return { success: false, recorded: false, views_count: 0 };
    }
    return res.json();
  } catch {
    // Non-blocking failure guarantee: Fail silently if network/server is unavailable
    return { success: false, recorded: false, views_count: 0 };
  }
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

export async function toggleCommentLike(commentId: string): Promise<{ liked: boolean; likes_count: number }> {
  // 1. Primary: Use resilient Axios API client
  try {
    const res = await api.post<{ liked: boolean; likes_count: number }>(`/community/comment/${commentId}/like`);
    if (res.data && typeof res.data.liked === 'boolean') {
      return res.data;
    }
  } catch (apiErr) {
    console.warn('[CommunityService] API /community/comment/:id/like failed, falling back to direct Supabase operation:', apiErr);
  }

  // 2. Direct Supabase Fallback (executes with user RLS)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existingLike } = await supabase
      .from('community_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingLike) {
      await supabase
        .from('community_comment_likes')
        .delete()
        .eq('id', existingLike.id);

      const { data: c } = await supabase
        .from('community_comments')
        .select('likes_count')
        .eq('id', commentId)
        .maybeSingle();

      return { liked: false, likes_count: c?.likes_count ?? 0 };
    } else {
      const { error: insErr } = await supabase
        .from('community_comment_likes')
        .insert([{ comment_id: commentId, user_id: user.id }]);
      if (insErr && insErr.code !== '23505') throw insErr;

      const { data: c } = await supabase
        .from('community_comments')
        .select('likes_count')
        .eq('id', commentId)
        .maybeSingle();

      return { liked: true, likes_count: c?.likes_count ?? 1 };
    }
  } catch (dbErr) {
    console.error('[CommunityService] Direct Supabase toggleCommentLike failed:', dbErr);
    throw dbErr;
  }
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
    xhr.open('POST', `${API_URL}/api/upload/media`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url || data.secure_url);
        } catch { reject(new Error('Invalid upload response')); }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(formData);
  });
}
