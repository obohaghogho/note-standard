import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Upload,
  Zap,
  Globe,
  Tag,
  DollarSign,
  CheckCircle,
} from 'lucide-react-native';

const ArrowLeftIcon = ArrowLeft as any;
const UploadIcon = Upload as any;
const ZapIcon = Zap as any;
const GlobeIcon = Globe as any;
const TagIcon = Tag as any;
const DollarSignIcon = DollarSign as any;
const CheckCircleIcon = CheckCircle as any;

import apiClient from '../../api/apiClient';
import { ImagePickerModal } from '../../components/common/ImagePickerModal';

interface CampaignBuilderScreenProps {
  navigation: any;
}

export const CampaignBuilderScreen: React.FC<CampaignBuilderScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('general, tech');

  const [tier, setTier] = useState<'basic' | 'boost' | 'premium'>('boost');
  const [cpcBid, setCpcBid] = useState('0.10');

  const [imageUrl, setImageUrl] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleImageSelected = async (img: { uri: string; type: string; name: string }) => {
    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('file', {
        uri: img.uri,
        type: img.type,
        name: img.name,
      } as any);

      const res = await apiClient.post('/upload/image?type=ad', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.url) {
        setImageUrl(res.data.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', 'Could not upload ad banner image.');
    } finally {
      setUploadingImage(false);
      setShowImagePicker(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Validation Error', 'Please enter a campaign title and content.');
      return;
    }

    if (destinationUrl.trim()) {
      const lower = destinationUrl.trim().toLowerCase();
      if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        Alert.alert('Invalid Destination URL', 'Destination URL must begin with http:// or https://');
        return;
      }
    }

    try {
      setSubmitting(true);
      const tagsArray = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

      const res = await apiClient.post('/ads', {
        title: title.trim(),
        content: content.trim(),
        destination_url: destinationUrl.trim() || undefined,
        link_url: destinationUrl.trim() || undefined,
        image_url: imageUrl || undefined,
        tags: tagsArray,
        tier,
        cpc_bid: parseFloat(cpcBid) || 0.10,
      });

      if (res.data) {
        Alert.alert('Campaign Created', 'Your ad campaign has been submitted for moderation review!');
        navigation.goBack();
      }
    } catch (err: any) {
      Alert.alert('Creation Error', err.response?.data?.error || err.message || 'Failed to submit campaign.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Ad Campaign</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Ad Title & Body Form */}
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Campaign Title *</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. NoteStandard Premium Trading Suite"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.fieldLabel}>Ad Content Body *</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={content}
            onChangeText={setContent}
            placeholder="Write compelling ad copy for your audience..."
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={4}
          />

          <Text style={styles.fieldLabel}>Target Link URL (Destination)</Text>
          <TextInput
            style={styles.textInput}
            value={destinationUrl}
            onChangeText={setDestinationUrl}
            placeholder="https://app.notestandard.com/offer"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.fieldLabel}>Category Tags (comma separated)</Text>
          <TextInput
            style={styles.textInput}
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder="fintech, crypto, trading"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
          />
        </View>

        {/* Banner Upload Card */}
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Ad Banner Media</Text>

          {imageUrl ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.changeImageBtn} onPress={() => setShowImagePicker(true)}>
                <Text style={styles.changeImageText}>Change Image</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBtn} onPress={() => setShowImagePicker(true)}>
              <UploadIcon size={22} color="#3B82F6" />
              <Text style={styles.uploadBtnText}>Upload Campaign Image</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tier & Bidding Selection Card */}
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Auction Tier & CPC Bid</Text>

          <View style={styles.tierGrid}>
            {[
              { id: 'basic', title: 'Basic', val: '$5 budget', bid: '0.05' },
              { id: 'boost', title: 'Boost', val: '$15 budget', bid: '0.10' },
              { id: 'premium', title: 'Premium', val: '$30 budget', bid: '0.25' },
            ].map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tierOption, tier === t.id && styles.tierOptionSelected]}
                onPress={() => {
                  setTier(t.id as any);
                  setCpcBid(t.bid);
                }}
              >
                <Text style={styles.tierOptionTitle}>{t.title}</Text>
                <Text style={styles.tierOptionSub}>{t.val}</Text>
                {tier === t.id && <CheckCircleIcon size={16} color="#3B82F6" style={styles.checkPos} />}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Cost Per Click (CPC) Bid ($)</Text>
          <TextInput
            style={styles.textInput}
            value={cpcBid}
            onChangeText={setCpcBid}
            placeholder="0.10"
            placeholderTextColor="#64748B"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleCreateCampaign} disabled={submitting || uploadingImage}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Submit Ad Campaign</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Image Picker for Ad */}
      <ImagePickerModal
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        title="Select Ad Banner Image"
        allowAspect={[16, 9]}
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
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3B82F6',
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  imagePreviewContainer: {
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 10,
  },
  changeImageBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  changeImageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tierGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tierOption: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  tierOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  tierOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tierOptionSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  checkPos: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  submitBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
