import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Image as ImageIcon, Video, BarChart2, Link as LinkIcon, Type,
  AtSign, Hash, Loader2, ChevronDown
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import {
  CommunityPost,
  createPost,
  editPost as apiEditPost,
  uploadMediaFile,
} from '../../services/communityService';

const CATEGORIES = ['General', 'Technology', 'Business', 'Science', 'Education', 'Health', 'Finance', 'Design', 'Career', 'Other'];
const MAX_CHARS = 5000;

interface Props {
  onClose: () => void;
  onPosted: (post: CommunityPost) => void;
  editPost?: CommunityPost;
}

type PostType = 'text' | 'image' | 'video' | 'poll' | 'link';

export const PostComposer: React.FC<Props> = ({ onClose, onPosted, editPost }) => {
  const { socket } = useSocket();

  const [postType, setPostType] = useState<PostType>(editPost?.post_type as PostType || 'text');
  const [title, setTitle] = useState(editPost?.title || '');
  const [content, setContent] = useState(editPost?.content || '');
  const [category, setCategory] = useState(editPost?.category || 'General');
  const [tags, setTags] = useState<string[]>(editPost?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [linkUrl, setLinkUrl] = useState(editPost?.link_url || '');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>(editPost?.media_urls || []);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const DRAFT_KEY = 'community_post_draft';

  // Load draft on mount (only for new posts)
  useEffect(() => {
    if (!editPost) {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.content) setContent(parsed.content);
          if (parsed.title) setTitle(parsed.title);
          setDraft('draft restored');
        } catch {
          // Ignore malformed draft JSON — start fresh
        }
      }
    }
  }, [editPost]);

  // Auto-save draft
  useEffect(() => {
    if (editPost) return;
    const id = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, title }));
    }, 1000);
    return () => clearTimeout(id);
  }, [content, title, editPost]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    if (!content.trim() && !title.trim() && mediaPreviews.length === 0) {
      return 'Please add some content.';
    }
    if (content.length > MAX_CHARS) return `Content too long (max ${MAX_CHARS} chars).`;
    if (postType === 'poll') {
      const filled = pollOptions.filter(o => o.trim());
      if (filled.length < 2) return 'Polls need at least 2 options.';
    }
    if (postType === 'link' && linkUrl && !linkUrl.startsWith('http')) {
      return 'Link must start with http:// or https://';
    }
    return null;
  }, [content, title, mediaPreviews, postType, pollOptions, linkUrl]);

  // ── Media upload ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setMediaFiles(prev => [...prev, ...files]);
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      setMediaPreviews(prev => [...prev, url]);
      setUploadProgress(prev => [...prev, 0]);
    });
  }, []);

  const removeMedia = useCallback((idx: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
    setMediaPreviews(prev => prev.filter((_, i) => i !== idx));
    setUploadProgress(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Tag input ─────────────────────────────────────────────────────────────
  const addTag = useCallback(() => {
    const t = tagInput.trim().replace(/^#+/, '');
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const valErr = validate();
    if (valErr) { setError(valErr); return; }
    setSubmitting(true);
    setError(null);

    try {
      // Upload new files
      const uploadedUrls: string[] = [];
      for (let i = 0; i < mediaFiles.length; i++) {
        const url = await uploadMediaFile(mediaFiles[i], (pct) => {
          setUploadProgress(prev => prev.map((p, j) => j === i ? pct : p));
        });
        uploadedUrls.push(url);
      }

      // Existing (edit) URLs that weren't removed
      const allMediaUrls = [
        ...mediaPreviews.filter(u => u.startsWith('http') && !u.startsWith('blob:')),
        ...uploadedUrls,
      ];

      let result: CommunityPost;
      if (editPost) {
        result = await apiEditPost(editPost.id, { title: title.trim() || undefined, content: content.trim() });
        if (socket) socket.emit('community:post_edited', { postId: editPost.id, updates: result });
      } else {
        result = await createPost({
          title: title.trim() || undefined,
          content: content.trim(),
          post_type: postType,
          category,
          tags,
          media_urls: allMediaUrls,
          link_url: postType === 'link' ? linkUrl : undefined,
          poll_options: postType === 'poll' ? pollOptions.filter(o => o.trim()).map((o, i) => ({ id: `opt_${i}`, option_text: o, votes_count: 0 })) : undefined,
        });
        // Emit WS for real-time feed update
        if (socket) socket.emit('community:post_created', { post: result });
        // Clear draft
        localStorage.removeItem(DRAFT_KEY);
      }

      onPosted(result);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Post failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [validate, mediaFiles, mediaPreviews, editPost, title, content, postType, category, tags, linkUrl, pollOptions, socket, onPosted, onClose]);

  const charCount = content.length;
  const charPct = Math.min(charCount / MAX_CHARS, 1);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {editPost ? 'Edit Post' : 'Create Post'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Post type tabs */}
        {!editPost && (
          <div className="flex items-center gap-1 px-5 pt-4 pb-2">
            {([
              { type: 'text', icon: <Type size={15} />, label: 'Text' },
              { type: 'image', icon: <ImageIcon size={15} />, label: 'Image' },
              { type: 'video', icon: <Video size={15} />, label: 'Video' },
              { type: 'poll', icon: <BarChart2 size={15} />, label: 'Poll' },
              { type: 'link', icon: <LinkIcon size={15} />, label: 'Link' },
            ] as const).map(({ type, icon, label }) => (
              <button
                key={type}
                onClick={() => setPostType(type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${postType === type ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
          {draft && !editPost && (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
              ✏ Draft restored. Changes are auto-saved.
            </div>
          )}

          {/* Title (optional) */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full text-lg font-semibold bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none border-b border-transparent focus:border-gray-200 dark:focus:border-gray-700 pb-1 transition-colors"
            maxLength={200}
          />

          {/* Main content textarea */}
          {(postType === 'text' || postType === 'image' || postType === 'video') && (
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Share your knowledge… Use #hashtag and @mention"
                rows={5}
                maxLength={MAX_CHARS}
                className="w-full bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 text-sm leading-relaxed focus:outline-none resize-none"
              />
              {/* Char counter ring */}
              <div className="absolute bottom-1 right-1 flex items-center gap-1">
                <svg className="-rotate-90" width="24" height="24">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                  <circle
                    cx="12" cy="12" r="9" fill="none"
                    stroke={charPct > 0.9 ? '#ef4444' : '#3b82f6'}
                    strokeWidth="2"
                    strokeDasharray={`${56.5 * charPct} 56.5`}
                    strokeLinecap="round"
                  />
                </svg>
                {charPct > 0.8 && <span className={`text-xs ${charPct > 0.9 ? 'text-red-500' : 'text-gray-400'}`}>{MAX_CHARS - charCount}</span>}
              </div>
            </div>
          )}

          {/* Link input */}
          {postType === 'link' && (
            <input
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              type="url"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {/* Poll options */}
          {postType === 'poll' && (
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button onClick={() => setPollOptions(prev => [...prev, ''])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  + Add option
                </button>
              )}
            </div>
          )}

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {mediaPreviews.map((url, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-square">
                  <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                  {uploadProgress[idx] !== undefined && uploadProgress[idx] < 100 && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{uploadProgress[idx]}%</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Category */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {tags.map((t, i) => (
                <span key={i} className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full">
                  #{t}
                  <button onClick={() => setTags(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-500 transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Hash size={14} className="text-gray-400 shrink-0" />
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && addTag()}
                onBlur={addTag}
                placeholder="Add hashtag"
                className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                maxLength={50}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {(postType === 'image' || postType === 'video') && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                  aria-label="Attach media"
                >
                  <ImageIcon size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={postType === 'video' ? 'video/*' : 'image/*'}
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            )}
            <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition-colors" aria-label="Mention user">
              <AtSign size={18} />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
            {editPost ? 'Save Changes' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
};
