import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MessageSquare,
  Heart,
  Bookmark,
  Share2,
  MoreVertical,
  PlusCircle,
  UserPlus,
  UserCheck,
  Send,
  Image as ImageIcon,
  Flag,
  CheckCircle,
  X,
  Search,
} from 'lucide-react-native';

const MessageSquareIcon = MessageSquare as any;
const HeartIcon = Heart as any;
const BookmarkIcon = Bookmark as any;
const Share2Icon = Share2 as any;
const MoreVerticalIcon = MoreVertical as any;
const PlusCircleIcon = PlusCircle as any;
const UserPlusIcon = UserPlus as any;
const UserCheckIcon = UserCheck as any;
const SendIcon = Send as any;
const ImageIconComponent = ImageIcon as any;
const FlagIcon = Flag as any;
const CheckCircleIcon = CheckCircle as any;
const XIcon = X as any;
const SearchIcon = Search as any;

import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { ImagePickerModal } from '../../components/common/ImagePickerModal';

export interface FeedPost {
  id: string;
  item_type?: 'NORMAL_POST' | 'AD' | 'SYSTEM_ITEM';
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar?: string;
  author_verified?: boolean;
  content: string;
  image_url?: string;
  likes_count: number;
  comments_count: number;
  has_liked?: boolean;
  has_bookmarked?: boolean;
  is_following?: boolean;
  created_at: string;
}

export interface PostComment {
  id: string;
  author_name: string;
  author_username: string;
  author_avatar?: string;
  content: string;
  created_at: string;
}

interface CommunityFeedScreenProps {
  navigation: any;
}

export const CommunityFeedScreen: React.FC<CommunityFeedScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Comments Drawer
  const [selectedPostForComments, setSelectedPostForComments] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Report Modal
  const [selectedPostForReport, setSelectedPostForReport] = useState<FeedPost | null>(null);
  const [reportReason, setReportReason] = useState('Spam');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Fetch Feed Posts
  const fetchFeed = useCallback(async (pageNum = 1, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);

      const res = await apiClient.get(`/community/feed?page=${pageNum}&limit=10`);
      const newPosts: FeedPost[] = res.data?.posts || res.data || [];

      if (isRefresh || pageNum === 1) {
        setPosts(newPosts.map(p => ({ ...p, item_type: p.item_type || 'NORMAL_POST' })));
      } else {
        setPosts(prev => [...prev, ...newPosts.map(p => ({ ...p, item_type: p.item_type || 'NORMAL_POST' }))]);
      }

      setHasMore(newPosts.length >= 10);
      setPage(pageNum);
    } catch (err) {
      console.warn('[CommunityFeed] Error loading feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(1);
  }, [fetchFeed]);

  // Handle Post Creation
  const handleCreatePost = async () => {
    if (!postContent.trim() && !postImageUrl) {
      Alert.alert('Empty Post', 'Please write something or attach an image.');
      return;
    }

    try {
      setSubmittingPost(true);
      await apiClient.post('/community/post', {
        content: postContent.trim(),
        image_url: postImageUrl || undefined,
      });

      Alert.alert('Post Published', 'Your post is now live on the community feed!');
      setShowCreateModal(false);
      setPostContent('');
      setPostImageUrl('');
      fetchFeed(1, true);
    } catch (err: any) {
      Alert.alert('Post Error', err.response?.data?.error || err.message || 'Failed to create post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  // Image Select for Post
  const handleImageSelected = async (img: { uri: string; type: string; name: string }) => {
    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('file', {
        uri: img.uri,
        type: img.type,
        name: img.name,
      } as any);

      const res = await apiClient.post('/upload/image?type=post', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.url) {
        setPostImageUrl(res.data.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', 'Could not upload attached image.');
    } finally {
      setUploadingImage(false);
      setShowImagePicker(false);
    }
  };

  // Toggle Like
  const handleToggleLike = async (post: FeedPost) => {
    const originalLiked = post.has_liked;
    const newLiked = !originalLiked;
    const newCount = originalLiked ? Math.max(0, post.likes_count - 1) : post.likes_count + 1;

    // Optimistic Update
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, has_liked: newLiked, likes_count: newCount } : p))
    );

    try {
      await apiClient.post('/community/like', { target_id: post.id, target_type: 'post' });
    } catch (err) {
      // Rollback on failure
      setPosts(prev =>
        prev.map(p => (p.id === post.id ? { ...p, has_liked: originalLiked, likes_count: post.likes_count } : p))
      );
    }
  };

  // Toggle Bookmark
  const handleToggleBookmark = async (post: FeedPost) => {
    const newBookmarked = !post.has_bookmarked;
    setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, has_bookmarked: newBookmarked } : p)));

    try {
      await apiClient.post(`/community/post/${post.id}/bookmark`);
    } catch (err) {
      setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, has_bookmarked: post.has_bookmarked } : p)));
    }
  };

  // Toggle Follow Author
  const handleToggleFollow = async (authorId: string, isFollowing?: boolean) => {
    const newFollowState = !isFollowing;
    setPosts(prev =>
      prev.map(p => (p.author_id === authorId ? { ...p, is_following: newFollowState } : p))
    );

    try {
      await apiClient.post(`/community/profile/${authorId}/follow`);
    } catch (err) {
      setPosts(prev =>
        prev.map(p => (p.author_id === authorId ? { ...p, is_following: isFollowing } : p))
      );
    }
  };

  // Open Comments Drawer
  const handleOpenComments = async (post: FeedPost) => {
    setSelectedPostForComments(post);
    setComments([]);
    setLoadingComments(true);

    try {
      const res = await apiClient.get(`/community/post/${post.id}/comments`);
      setComments(res.data?.comments || res.data || []);
    } catch (err) {
      console.warn('[CommunityFeed] Error loading comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  // Submit Comment
  const handleAddComment = async () => {
    if (!commentInput.trim() || !selectedPostForComments) return;

    try {
      setSubmittingComment(true);
      const res = await apiClient.post('/community/comment', {
        post_id: selectedPostForComments.id,
        content: commentInput.trim(),
      });

      const newComment: PostComment = res.data?.comment || {
        id: String(Date.now()),
        author_name: user?.full_name || 'You',
        author_username: user?.username || 'user',
        author_avatar: user?.avatar_url,
        content: commentInput.trim(),
        created_at: new Date().toISOString(),
      };

      setComments(prev => [newComment, ...prev]);
      setCommentInput('');

      // Update comment count on post
      setPosts(prev =>
        prev.map(p =>
          p.id === selectedPostForComments.id ? { ...p, comments_count: p.comments_count + 1 } : p
        )
      );
    } catch (err: any) {
      Alert.alert('Comment Error', 'Failed to submit comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Submit Report
  const handleReportPost = async () => {
    if (!selectedPostForReport) return;

    try {
      setSubmittingReport(true);
      await apiClient.post('/community/report', {
        target_id: selectedPostForReport.id,
        target_type: 'post',
        reason: reportReason,
      });

      Alert.alert('Report Submitted', 'Thank you. Our moderation team will review this item.');
      setSelectedPostForReport(null);
    } catch (err: any) {
      Alert.alert('Report Error', 'Failed to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Render Individual Post Card
  const renderPostItem = ({ item }: { item: FeedPost }) => (
    <View style={styles.postCard}>
      {/* Post Author Header */}
      <View style={styles.authorRow}>
        <TouchableOpacity
          style={styles.authorInfo}
          onPress={() => navigation.navigate('PublicProfile', { userId: item.author_id })}
        >
          {item.author_avatar ? (
            <Image source={{ uri: item.author_avatar }} style={styles.authorAvatar} />
          ) : (
            <View style={[styles.authorAvatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>
                {(item.author_name || item.author_username || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.authorMeta}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName}>{item.author_name || item.author_username}</Text>
              {item.author_verified && <CheckCircleIcon size={14} color="#3B82F6" />}
            </View>
            <Text style={styles.authorSub}>@{item.author_username || 'user'}</Text>
          </View>
        </TouchableOpacity>

        {/* Follow / Options Buttons */}
        <View style={styles.headerRightActions}>
          {item.author_id !== user?.id && (
            <TouchableOpacity
              style={[styles.followBtn, item.is_following && styles.followingBtn]}
              onPress={() => handleToggleFollow(item.author_id, item.is_following)}
            >
              {item.is_following ? (
                <UserCheckIcon size={14} color="#10B981" />
              ) : (
                <UserPlusIcon size={14} color="#3B82F6" />
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.moreBtn} onPress={() => setSelectedPostForReport(item)}>
            <MoreVerticalIcon size={18} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Post Content */}
      <Text style={styles.postBody}>{item.content}</Text>

      {/* Post Image Attachment if Present */}
      {item.image_url && (
        <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />
      )}

      {/* Post Action Footer */}
      <View style={styles.postFooter}>
        {/* Like */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleLike(item)}>
          <HeartIcon size={18} color={item.has_liked ? '#EF4444' : '#64748B'} fill={item.has_liked ? '#EF4444' : 'transparent'} />
          <Text style={[styles.actionText, item.has_liked && styles.likedText]}>{item.likes_count}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenComments(item)}>
          <MessageSquareIcon size={18} color="#64748B" />
          <Text style={styles.actionText}>{item.comments_count}</Text>
        </TouchableOpacity>

        {/* Bookmark */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleBookmark(item)}>
          <BookmarkIcon size={18} color={item.has_bookmarked ? '#F59E0B' : '#64748B'} fill={item.has_bookmarked ? '#F59E0B' : 'transparent'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Community Feed</Text>
        <TouchableOpacity style={styles.createPostHeaderBtn} onPress={() => setShowCreateModal(true)}>
          <PlusCircleIcon size={22} color="#FFFFFF" />
          <Text style={styles.createBtnText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Feed List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading community posts...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={renderPostItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchFeed(1, true)} tintColor="#3B82F6" />}
          onEndReached={() => {
            if (hasMore && !loading) fetchFeed(page + 1);
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Posts Yet</Text>
              <Text style={styles.emptySub}>Be the first to share an update with the NoteStandard community!</Text>
            </View>
          }
        />
      )}

      {/* CREATE POST MODAL */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Community Post</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <XIcon size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.postInput}
              value={postContent}
              onChangeText={setPostContent}
              placeholder="What's happening on NoteStandard today?"
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={5}
            />

            {postImageUrl ? (
              <View style={styles.attachedImageContainer}>
                <Image source={{ uri: postImageUrl }} style={styles.attachedPreview} />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => setPostImageUrl('')}>
                  <XIcon size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.createModalActions}>
              <TouchableOpacity style={styles.attachBtn} onPress={() => setShowImagePicker(true)}>
                <ImageIconComponent size={20} color="#3B82F6" />
                <Text style={styles.attachBtnText}>Attach Image</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.publishBtn} onPress={handleCreatePost} disabled={submittingPost || uploadingImage}>
                {submittingPost ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.publishBtnText}>Publish</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* COMMENTS DRAWER MODAL */}
      <Modal visible={selectedPostForComments !== null} transparent animationType="slide" onRequestClose={() => setSelectedPostForComments(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments ({selectedPostForComments?.comments_count || 0})</Text>
              <TouchableOpacity onPress={() => setSelectedPostForComments(null)}>
                <XIcon size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <ActivityIndicator color="#3B82F6" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                style={{ flex: 1 }}
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <Text style={styles.commentAuthor}>{item.author_name || item.author_username}:</Text>
                    <Text style={styles.commentBody}>{item.content}</Text>
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={styles.noCommentsText}>No comments yet. Start the conversation!</Text>
                }
              />
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentTextInput}
                value={commentInput}
                onChangeText={setCommentInput}
                placeholder="Write a comment..."
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity style={styles.sendCommentBtn} onPress={handleAddComment} disabled={submittingComment}>
                {submittingComment ? <ActivityIndicator color="#FFFFFF" size="small" /> : <SendIcon size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* REPORT POST MODAL */}
      <Modal visible={selectedPostForReport !== null} transparent animationType="slide" onRequestClose={() => setSelectedPostForReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Post</Text>
              <TouchableOpacity onPress={() => setSelectedPostForReport(null)}>
                <XIcon size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Why are you reporting this post?</Text>

            {['Spam', 'Harassment', 'Inappropriate Content', 'Other'].map(reason => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonOption, reportReason === reason && styles.reasonOptionSelected]}
                onPress={() => setReportReason(reason)}
              >
                <Text style={styles.reasonText}>{reason}</Text>
                {reportReason === reason && <CheckCircleIcon size={16} color="#3B82F6" />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.submitReportBtn} onPress={handleReportPost} disabled={submittingReport}>
              {submittingReport ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitReportText}>Submit Report</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Picker for Post */}
      <ImagePickerModal
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        title="Select Post Image"
        onImageSelected={handleImageSelected}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  createPostHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  postCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  authorMeta: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  authorSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  followingBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  moreBtn: {
    padding: 6,
  },
  postBody: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  likedText: {
    color: '#EF4444',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  postInput: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  attachedImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  attachedPreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 6,
  },
  createModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  publishBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  publishBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentRow: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 4,
  },
  commentBody: {
    fontSize: 13,
    color: '#E2E8F0',
  },
  noCommentsText: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sendCommentBtn: {
    backgroundColor: '#3B82F6',
    padding: 12,
    borderRadius: 12,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  reasonOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  reasonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  submitReportBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitReportText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
