import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Smartphone,
  Building2,
  Globe2,
  FileText,
  Upload,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';

const ShieldCheckIcon = ShieldCheck as any;
const CheckCircle2Icon = CheckCircle2 as any;
const LockIcon = Lock as any;
const ArrowLeftIcon = ArrowLeft as any;
const SmartphoneIcon = Smartphone as any;
const Building2Icon = Building2 as any;
const Globe2Icon = Globe2 as any;
const FileTextIcon = FileText as any;
const UploadIcon = Upload as any;
const AlertCircleIcon = AlertCircle as any;
const RefreshCwIcon = RefreshCw as any;

import apiClient from '../../api/apiClient';
import { supabase } from '../../api/supabase';
import { useAuth } from '../../context/AuthContext';
import { ImagePickerModal } from '../../components/common/ImagePickerModal';

interface KycVerificationScreenProps {
  navigation: any;
}

export const KycVerificationScreen: React.FC<KycVerificationScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Authoritative server profile fields
  const [kycLevel, setKycLevel] = useState(user?.kyc_level || 0);
  const [phone, setPhone] = useState(user?.phone || '');
  const [kycRejectionReason, setKycRejectionReason] = useState<string | null>(null);

  // Modal States
  const [showTier1Modal, setShowTier1Modal] = useState(false);
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [showTier3Modal, setShowTier3Modal] = useState(false);

  // Form Inputs
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [bvnInput, setBvnInput] = useState('');
  const [dobInput, setDobInput] = useState('');

  const [addressInput, setAddressInput] = useState('');
  const [occupationInput, setOccupationInput] = useState('');
  const [idCardUrl, setIdCardUrl] = useState('');
  const [utilityBillUrl, setUtilityBillUrl] = useState('');

  const [uploadTarget, setUploadTarget] = useState<'idCard' | 'utilityBill' | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Fetch Authoritative KYC Status from Server
  const fetchAuthoritativeKycStatus = async () => {
    try {
      setLoading(true);
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('kyc_level, phone, kyc_rejection_reason')
        .eq('id', user.id)
        .single();

      if (data && !error) {
        setKycLevel(data.kyc_level || 0);
        setPhone(data.phone || '');
        setKycRejectionReason(data.kyc_rejection_reason || null);
      }
    } catch (err) {
      console.error('[KycVerificationScreen] Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthoritativeKycStatus();
  }, [user?.id]);

  // Tier 1 Submit (Phone Update & Server Re-fetch)
  const handleTier1Submit = async () => {
    const cleaned = phoneInput.trim();
    if (!cleaned || cleaned.length < 8) {
      Alert.alert('Validation Error', 'Please enter a valid phone number (at least 8 digits).');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.patch('/auth/me', { phone: cleaned });
      await refreshProfile();
      await fetchAuthoritativeKycStatus();

      Alert.alert('Tier 1 Activated', 'Phone number saved and Tier 1 verification active.');
      setShowTier1Modal(false);
    } catch (err: any) {
      Alert.alert('Submission Error', err.response?.data?.message || err.message || 'Failed to submit Tier 1.');
    } finally {
      setSubmitting(false);
    }
  };

  // Tier 2 Submit (BVN/NIN & NGN Account Provisioning)
  const handleTier2Submit = async () => {
    if (!bvnInput || bvnInput.trim().length < 10) {
      Alert.alert('Validation Error', 'Please enter a valid 11-digit BVN or NIN number.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.post('/wallet/virtual-account', {
        currency: 'NGN',
        bvn: bvnInput.trim(),
        dob: dobInput.trim(),
        phone: phone || phoneInput.trim(),
      });

      if (res.data?.success || res.data?.account) {
        await refreshProfile();
        await fetchAuthoritativeKycStatus();
        Alert.alert('Tier 2 Verification Submitted', 'NGN Virtual Bank Account activated!');
        setShowTier2Modal(false);
        setBvnInput('');
      } else {
        throw new Error(res.data?.error || 'Verification request returned unexpected result.');
      }
    } catch (err: any) {
      Alert.alert('Tier 2 Error', err.response?.data?.error || err.message || 'Failed to submit Tier 2 verification.');
    } finally {
      setSubmitting(false);
    }
  };

  // Tier 3 Document Upload Handler
  const handleDocSelected = async (image: { uri: string; type: string; name: string }) => {
    if (!uploadTarget) return;

    try {
      setUploadingDoc(true);
      const formData = new FormData();
      formData.append('file', {
        uri: image.uri,
        type: image.type,
        name: image.name,
      } as any);

      const res = await apiClient.post('/upload/image?type=kyc', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.url) {
        if (uploadTarget === 'idCard') {
          setIdCardUrl(res.data.url);
          Alert.alert('ID Card Uploaded', 'Government ID Card attached successfully.');
        } else {
          setUtilityBillUrl(res.data.url);
          Alert.alert('Utility Bill Uploaded', 'Utility Bill attached successfully.');
        }
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.message || err.message || 'Could not upload identity document.');
    } finally {
      setUploadingDoc(false);
      setUploadTarget(null);
    }
  };

  // Tier 3 Submit (Document Uploads & Server-Authoritative Compliance Request)
  const handleTier3Submit = async () => {
    if (!idCardUrl || !utilityBillUrl) {
      Alert.alert('Missing Documents', 'Please upload both Government ID Card and Utility Bill.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.post('/kyc/submit', {
        requestedTier: 3,
        governmentIdStoragePath: idCardUrl,
        utilityBillStoragePath: utilityBillUrl,
        residentialAddress: { address: addressInput.trim() },
        occupation: occupationInput.trim(),
      });

      if (res.data?.success) {
        await fetchAuthoritativeKycStatus();
        Alert.alert('Tier 3 Verification Submitted', 'Your Tier 3 verification request has been submitted for compliance review.');
        setShowTier3Modal(false);
      } else {
        throw new Error(res.data?.error || 'Verification request failed.');
      }
    } catch (err: any) {
      Alert.alert('Tier 3 Error', err.response?.data?.error || err.message || 'Failed to submit Tier 3 verification.');
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
        <Text style={styles.headerTitle}>Identity Verification (KYC)</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchAuthoritativeKycStatus} disabled={loading}>
          <RefreshCwIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerHeader}>
            <ShieldCheckIcon size={24} color="#60A5FA" />
            <Text style={styles.bannerTitle}>Account Tier Status</Text>
          </View>
          <Text style={styles.bannerSub}>
            Complete identity verification tiers to increase daily transaction limits and unlock multi-currency bank accounts.
          </Text>

          <View style={styles.activeTierBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTierText}>TIER {kycLevel} ACTIVE (SERVER AUTHORITATIVE)</Text>
          </View>

          {kycRejectionReason && (
            <View style={styles.rejectionBox}>
              <AlertCircleIcon size={18} color="#EF4444" />
              <Text style={styles.rejectionText}>Verification Rejected: {kycRejectionReason}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Fetching authoritative KYC state...</Text>
          </View>
        ) : (
          <View style={styles.tiersGrid}>
            {/* TIER 1 CARD */}
            <View style={[styles.tierCard, kycLevel >= 1 && styles.tierCardActive]}>
              <View style={styles.tierHeader}>
                <View style={styles.tierTitleRow}>
                  <SmartphoneIcon size={20} color={kycLevel >= 1 ? '#10B981' : '#94A3B8'} />
                  <Text style={styles.tierTitle}>Tier 1 — Phone Verification</Text>
                </View>
                {kycLevel >= 1 ? (
                  <CheckCircle2Icon size={20} color="#10B981" />
                ) : (
                  <Text style={styles.statusPending}>REQUIRED</Text>
                )}
              </View>

              <Text style={styles.tierDesc}>
                Basic verification requiring an 8+ digit verified phone number. Unlocks basic wallet operations.
              </Text>

              <TouchableOpacity
                style={[styles.tierBtn, kycLevel >= 1 && styles.tierBtnCompleted]}
                onPress={() => setShowTier1Modal(true)}
                disabled={kycLevel >= 1}
              >
                <Text style={styles.tierBtnText}>{kycLevel >= 1 ? '✓ Tier 1 Verified' : 'Complete Tier 1'}</Text>
              </TouchableOpacity>
            </View>

            {/* TIER 2 CARD */}
            <View style={[styles.tierCard, kycLevel >= 2 && styles.tierCardActive]}>
              <View style={styles.tierHeader}>
                <View style={styles.tierTitleRow}>
                  <Building2Icon size={20} color={kycLevel >= 2 ? '#10B981' : '#94A3B8'} />
                  <Text style={styles.tierTitle}>Tier 2 — BVN / NIN Verification</Text>
                </View>
                {kycLevel >= 2 ? (
                  <CheckCircle2Icon size={20} color="#10B981" />
                ) : kycLevel < 1 ? (
                  <LockIcon size={18} color="#64748B" />
                ) : (
                  <Text style={styles.statusPending}>UNLOCKED</Text>
                )}
              </View>

              <Text style={styles.tierDesc}>
                Requires 11-digit BVN or NIN and Date of Birth. Unlocks NGN Virtual Bank Account and higher daily limits.
              </Text>

              <TouchableOpacity
                style={[
                  styles.tierBtn,
                  kycLevel >= 2 && styles.tierBtnCompleted,
                  kycLevel < 1 && styles.tierBtnDisabled,
                ]}
                onPress={() => setShowTier2Modal(true)}
                disabled={kycLevel < 1 || kycLevel >= 2}
              >
                <Text style={styles.tierBtnText}>
                  {kycLevel >= 2 ? '✓ Tier 2 Verified' : kycLevel < 1 ? 'Complete Tier 1 First' : 'Submit BVN / NIN'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* TIER 3 CARD */}
            <View style={[styles.tierCard, kycLevel >= 3 && styles.tierCardActive]}>
              <View style={styles.tierHeader}>
                <View style={styles.tierTitleRow}>
                  <Globe2Icon size={20} color={kycLevel >= 3 ? '#10B981' : '#94A3B8'} />
                  <Text style={styles.tierTitle}>Tier 3 — Document Verification</Text>
                </View>
                {kycLevel >= 3 ? (
                  <CheckCircle2Icon size={20} color="#10B981" />
                ) : (
                  <LockIcon size={18} color="#64748B" />
                )}
              </View>

              <Text style={styles.tierDesc}>
                Requires Government ID Card and Utility Bill upload. Unlocks USD, EUR, and GBP international bank accounts.
              </Text>

              <TouchableOpacity
                style={[
                  styles.tierBtn,
                  kycLevel >= 3 && styles.tierBtnCompleted,
                  kycLevel < 2 && styles.tierBtnDisabled,
                ]}
                onPress={() => setShowTier3Modal(true)}
                disabled={kycLevel < 2 || kycLevel >= 3}
              >
                <Text style={styles.tierBtnText}>
                  {kycLevel >= 3 ? '✓ Tier 3 Verified' : kycLevel < 2 ? 'Complete Tier 2 First' : 'Upload Documents'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* TIER 1 MODAL */}
      <Modal visible={showTier1Modal} transparent animationType="slide" onRequestClose={() => setShowTier1Modal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tier 1 — Phone Verification</Text>
            <Text style={styles.modalSub}>Enter your phone number (at least 8 digits) to activate Tier 1.</Text>

            <TextInput
              style={styles.modalInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="+234 800 000 0000"
              placeholderTextColor="#64748B"
              keyboardType="phone-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTier1Modal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleTier1Submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSubmitText}>Submit Tier 1</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TIER 2 MODAL */}
      <Modal visible={showTier2Modal} transparent animationType="slide" onRequestClose={() => setShowTier2Modal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tier 2 — BVN / NIN Verification</Text>
            <Text style={styles.modalSub}>Enter your 11-digit BVN or NIN and Date of Birth to provision your NGN Bank Account.</Text>

            <TextInput
              style={styles.modalInput}
              value={bvnInput}
              onChangeText={setBvnInput}
              placeholder="11-Digit BVN / NIN"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              maxLength={11}
            />

            <TextInput
              style={styles.modalInput}
              value={dobInput}
              onChangeText={setDobInput}
              placeholder="DOB (YYYY-MM-DD)"
              placeholderTextColor="#64748B"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTier2Modal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleTier2Submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSubmitText}>Submit Tier 2</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TIER 3 MODAL */}
      <Modal visible={showTier3Modal} transparent animationType="slide" onRequestClose={() => setShowTier3Modal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Tier 3 — Identity Documents</Text>
            <Text style={styles.modalSub}>Attach Government ID Card and Utility Bill to unlock USD, EUR, GBP accounts.</Text>

            <TextInput
              style={styles.modalInput}
              value={addressInput}
              onChangeText={setAddressInput}
              placeholder="Residential Address"
              placeholderTextColor="#64748B"
            />

            <TextInput
              style={styles.modalInput}
              value={occupationInput}
              onChangeText={setOccupationInput}
              placeholder="Occupation"
              placeholderTextColor="#64748B"
            />

            {/* Document Pickers */}
            <TouchableOpacity style={styles.docUploadBtn} onPress={() => setUploadTarget('idCard')}>
              <UploadIcon size={18} color="#3B82F6" />
              <Text style={styles.docUploadText}>
                {idCardUrl ? '✓ Government ID Attached' : 'Upload Government ID Card'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.docUploadBtn} onPress={() => setUploadTarget('utilityBill')}>
              <UploadIcon size={18} color="#10B981" />
              <Text style={styles.docUploadText}>
                {utilityBillUrl ? '✓ Utility Bill Attached' : 'Upload Utility Bill'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTier3Modal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleTier3Submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSubmitText}>Submit Tier 3</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Image Picker for Tier 3 Docs */}
      <ImagePickerModal
        visible={uploadTarget !== null}
        onClose={() => setUploadTarget(null)}
        title={uploadTarget === 'idCard' ? 'Select Government ID Document' : 'Select Utility Bill Document'}
        allowAspect={[4, 3]}
        onImageSelected={handleDocSelected}
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
  refreshBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  banner: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: 20,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bannerSub: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
  },
  activeTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeTierText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34D399',
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  rejectionText: {
    fontSize: 12,
    color: '#F87171',
    fontWeight: '600',
    flex: 1,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },
  tiersGrid: {
    gap: 16,
  },
  tierCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tierCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tierTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tierTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusPending: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tierDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
  },
  tierBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  tierBtnCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  tierBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tierBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 18,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  docUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  docUploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
