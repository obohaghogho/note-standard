import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Globe as GlobeRaw, Check as CheckRaw, X as XRaw } from 'lucide-react-native';

const Globe = GlobeRaw as any;
const Check = CheckRaw as any;
const X = XRaw as any;
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

interface LanguageSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  currentLanguage?: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français (French)', flag: '🇫🇷' },
  { code: 'es', name: 'Español (Spanish)', flag: '🇪🇸' },
  { code: 'pt', name: 'Português (Portuguese)', flag: '🇵🇹' },
  { code: 'sw', name: 'Kiswahili (Swahili)', flag: '🇰🇪' },
  { code: 'ar', name: 'العربية (Arabic)', flag: '🇸🇦' },
  { code: 'de', name: 'Deutsch (German)', flag: '🇩🇪' },
  { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' },
];

export const LanguageSettingsModal: React.FC<LanguageSettingsModalProps> = ({
  visible,
  onClose,
  currentLanguage = 'en',
}) => {
  const { user, refreshProfile } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState(
    user?.preferred_language || currentLanguage
  );
  const [saving, setSaving] = useState(false);

  const handleSelectLanguage = async (code: string) => {
    try {
      setSaving(true);
      setSelectedLanguage(code);

      // Save preference to server profile
      await apiClient.patch('/auth/me', {
        preferred_language: code,
      });

      await refreshProfile();
      Alert.alert('Language Updated', `Application language set to ${code.toUpperCase()}.`);
      onClose();
    } catch (err: any) {
      console.error('[LanguageSettingsModal] Save error:', err);
      Alert.alert('Error', 'Failed to save language preference.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Globe size={22} color="#3B82F6" />
              <Text style={styles.title}>Language / Locale</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Select your preferred display language for notes, chat translations, and interface elements.
          </Text>

          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {LANGUAGES.map((lang) => {
              const isSelected = selectedLanguage === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langItem, isSelected && styles.langItemSelected]}
                  onPress={() => handleSelectLanguage(lang.code)}
                  disabled={saving}
                >
                  <View style={styles.langLeft}>
                    <Text style={styles.flagText}>{lang.flag}</Text>
                    <Text style={[styles.langName, isSelected && styles.langNameSelected]}>
                      {lang.name}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkIcon}>
                      <Check size={16} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {saving && (
            <View style={styles.savingOverlay}>
              <ActivityIndicator color="#3B82F6" size="small" />
              <Text style={styles.savingText}>Updating language preference...</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 18,
  },
  listContainer: {
    marginBottom: 12,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  langItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flagText: {
    fontSize: 20,
  },
  langName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#CBD5E1',
  },
  langNameSelected: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 8,
  },
  savingText: {
    fontSize: 13,
    color: '#94A3B8',
  },
});
