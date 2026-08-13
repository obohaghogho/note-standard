import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft as ArrowLeftRaw,
  Camera as CameraRaw,
  User as UserRaw,
  Phone as PhoneRaw,
  Globe as GlobeRaw,
  FileText as FileTextRaw,
  Save as SaveRaw,
  CheckCircle2 as CheckCircle2Raw,
  AlertCircle as AlertCircleRaw,
  ImageIcon as ImageIconRaw,
} from 'lucide-react-native';

const ArrowLeft = ArrowLeftRaw as any;
const Camera = CameraRaw as any;
const User = UserRaw as any;
const Phone = PhoneRaw as any;
const Globe = GlobeRaw as any;
const FileText = FileTextRaw as any;
const Save = SaveRaw as any;
const CheckCircle2 = CheckCircle2Raw as any;
const AlertCircle = AlertCircleRaw as any;
const ImageIcon = ImageIconRaw as any;
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { ImagePickerModal } from '../../components/common/ImagePickerModal';

interface ProfileEditScreenProps {
  navigation: any;
}

export const ProfileEditScreen: React.FC<ProfileEditScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [countryCode, setCountryCode] = useState(user?.country_code || 'US');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(user?.cover_url || '');

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [pickerTarget, setPickerTarget] = useState<'avatar' | 'cover' | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setUsername(user.username || '');
      setBio(user.bio || '');
      setWebsite(user.website || '');
      setPhone(user.phone || '');
      setCountryCode(user.country_code || 'US');
      setAvatarUrl(user.avatar_url || '');
      setCoverUrl(user.cover_url || '');
    }
  }, [user]);

  const handleUploadImage = async (
    image: { uri: string; type: string; name: string },
    target: 'avatar' | 'cover'
  ) => {
    if (target === 'avatar') setUploadingAvatar(true);
    else setUploadingCover(true);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? image.uri : image.uri.replace('file://', ''),
        type: image.type,
        name: image.name,
      } as any);

      const endpoint = target === 'cover' ? '/upload/image?type=cover' : '/upload/image';
      const res = await apiClient.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.data?.url) {
        if (target === 'avatar') {
          setAvatarUrl(res.data.url);
          Alert.alert('Avatar Uploaded', 'Click Save Profile to apply changes.');
        } else {
          setCoverUrl(res.data.url);
          Alert.alert('Cover Banner Uploaded', 'Click Save Profile to apply changes.');
        }
      } else {
        throw new Error(res.data?.error || 'Upload returned invalid response');
      }
    } catch (err: any) {
      console.error(`[ProfileEditScreen] ${target} upload error:`, err.response?.data || err.message);
      Alert.alert(
        'Upload Failed',
        err.response?.data?.message || err.message || 'Failed to upload image. Please retry.'
      );
    } finally {
      if (target === 'avatar') setUploadingAvatar(false);
      else setUploadingCover(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      Alert.alert('Validation Error', 'Username cannot be empty.');
      return;
    }

    if (phone.trim() && phone.trim().length < 8) {
      Alert.alert('Validation Error', 'Please enter a valid phone number (at least 8 digits).');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        website: website.trim(),
        phone: phone.trim(),
        country_code: countryCode.trim().toUpperCase(),
        avatar_url: avatarUrl,
        cover_url: coverUrl,
      };

      await apiClient.patch('/auth/me', payload);
      await refreshProfile();

      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[ProfileEditScreen] Save error:', err.response?.data || err.message);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to save profile updates.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          style={[styles.saveHeaderBtn, saving && styles.btnDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Save size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Image Banner Box */}
        <View style={styles.coverBox}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}

          <TouchableOpacity
            style={styles.coverUploadBtn}
            onPress={() => setPickerTarget('cover')}
            disabled={uploadingCover}
          >
            {uploadingCover ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Camera size={16} color="#FFFFFF" />
                <Text style={styles.coverUploadText}>Edit Cover</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Avatar Image Circle Box */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={40} color="#94A3B8" />
              </View>
            )}

            <TouchableOpacity
              style={styles.avatarCameraBtn}
              onPress={() => setPickerTarget('avatar')}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Camera size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Display / Full Name</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter full name"
                placeholderTextColor="#64748B"
              />
            </View>
          </View>

          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.atSymbol}>@</Text>
              <TextInput
                style={styles.textInput}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Phone Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number (For Tier 1 Verification)</Text>
            <View style={styles.inputWrapper}>
              <Phone size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+234 800 000 0000"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Bio */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bio / Description</Text>
            <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell the community about yourself..."
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Website */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Website URL</Text>
            <View style={styles.inputWrapper}>
              <Globe size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://yourwebsite.com"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <CheckCircle2 size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Save Profile Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Image Picker Modal */}
      <ImagePickerModal
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        title={pickerTarget === 'avatar' ? 'Change Profile Picture' : 'Change Cover Banner'}
        allowAspect={pickerTarget === 'avatar' ? [1, 1] : [3, 1]}
        onImageSelected={(img) => {
          if (pickerTarget) handleUploadImage(img, pickerTarget);
        }}
      />
    </KeyboardAvoidingView>
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
  saveHeaderBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  coverBox: {
    height: 140,
    width: '100%',
    position: 'relative',
    backgroundColor: '#1E293B',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  coverUploadBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  coverUploadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -44,
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#0F172A',
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#0F172A',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    paddingHorizontal: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  atSymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
  },
  textAreaWrapper: {
    alignItems: 'flex-start',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
