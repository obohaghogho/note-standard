import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { AuthStackParamList } from '../navigation/AuthStack';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Live password requirements state
  const hasMinLen = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const isPasswordValid = hasMinLen && hasNumber && hasUpper;
  const isConfirmMatch = confirm.length > 0 && password === confirm;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleRegister = async () => {
    setServerError(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setServerError('Please fill in all required fields.');
      return;
    }
    if (!isEmailValid) {
      setServerError('Please enter a valid email address.');
      return;
    }
    if (!isPasswordValid) {
      setServerError('Please ensure your password satisfies all security requirements.');
      return;
    }
    if (password !== confirm) {
      setServerError('Passwords do not match. Please verify your confirmation password.');
      return;
    }
    if (!agreed) {
      setServerError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setLoading(true);
    const result = await register(fullName.trim(), email.trim().toLowerCase(), password);
    setLoading(false);

    if (!result.success) {
      setServerError(result.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a', '#060611']} style={styles.gradient}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.flex}
      >
        <ScrollView 
          contentContainerStyle={styles.scroll} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join NoteStandard today</Text>
          </View>

          <View style={styles.card}>
            {serverError && (
              <View style={styles.serverErrorBanner}>
                <Text style={styles.serverErrorIcon}>⚠️</Text>
                <Text style={styles.serverErrorText}>{serverError}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#444"
                value={fullName}
                onChangeText={(text: string) => {
                  setFullName(text);
                  if (serverError) setServerError(null);
                }}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#444"
                value={email}
                onChangeText={(text: string) => {
                  setEmail(text);
                  if (serverError) setServerError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor="#444"
                  value={password}
                  onChangeText={(text: string) => {
                    setPassword(text);
                    if (serverError) setServerError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>

              {/* Live Password Requirements Checklist */}
              <View style={styles.checklist}>
                <View style={styles.checkRow}>
                  <Text style={[styles.checkIcon, hasMinLen && styles.checkIconValid]}>
                    {hasMinLen ? '✓' : '○'}
                  </Text>
                  <Text style={[styles.checkText, hasMinLen && styles.checkTextValid]}>
                    At least 8 characters
                  </Text>
                </View>
                <View style={styles.checkRow}>
                  <Text style={[styles.checkIcon, hasNumber && styles.checkIconValid]}>
                    {hasNumber ? '✓' : '○'}
                  </Text>
                  <Text style={[styles.checkText, hasNumber && styles.checkTextValid]}>
                    Contains a number (0-9)
                  </Text>
                </View>
                <View style={styles.checkRow}>
                  <Text style={[styles.checkIcon, hasUpper && styles.checkIconValid]}>
                    {hasUpper ? '✓' : '○'}
                  </Text>
                  <Text style={[styles.checkText, hasUpper && styles.checkTextValid]}>
                    Contains an uppercase letter (A-Z)
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor="#444"
                  value={confirm}
                  onChangeText={(text: string) => {
                    setConfirm(text);
                    if (serverError) setServerError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
              {confirm.length > 0 && (
                <Text style={[styles.confirmHint, isConfirmMatch ? styles.confirmHintValid : styles.confirmHintInvalid]}>
                  {isConfirmMatch ? '✓ Passwords match' : '✕ Passwords do not match'}
                </Text>
              )}
            </View>

            <View style={styles.termsContainer}>
              <TouchableOpacity 
                style={[styles.checkbox, agreed && styles.checkboxChecked]} 
                onPress={() => {
                  setAgreed(!agreed);
                  if (serverError) setServerError(null);
                }}
              >
                {agreed && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
              <View style={styles.termsTextWrap}>
                <Text style={styles.termsText}>
                  By creating an account, you agree to our <Text style={styles.termsLink}>Terms of Service</Text> and <Text style={styles.termsLink}>Privacy Policy</Text>. 
                  You acknowledge that certain user activity, engagement analytics, platform interactions, advertising interactions, and anonymized platform data may be processed and utilized to improve services, platform performance, monetization systems, security, recommendations, and business operations in accordance with applicable laws and our Privacy Policy.
                </Text>
              </View>
            </View>

            {!agreed && (
              <Text style={styles.termsWarningText}>
                Please check the box above to accept the Terms of Service and Privacy Policy to continue.
              </Text>
            )}

            <TouchableOpacity 
              style={[styles.btn, (!agreed || loading) && styles.btnDisabled]} 
              onPress={handleRegister} 
              disabled={loading || !agreed}
            >
              <LinearGradient colors={agreed ? ['#6366f1', '#4f46e5'] : ['#333', '#222']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLinkText}>Already have an account? <Text style={styles.accent}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 24 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 14, marginTop: 4 },
  card: { backgroundColor: '#111122', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#1e1e3a' },
  serverErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b1219',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  serverErrorIcon: { fontSize: 16 },
  serverErrorText: { flex: 1, color: '#fca5a5', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  inputGroup: { marginBottom: 16 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#0a0a16', borderWidth: 1, borderColor: '#1e1e3a', borderRadius: 14, padding: 16, color: '#fff', fontSize: 15 },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a16',
    borderWidth: 1,
    borderColor: '#1e1e3a',
    borderRadius: 14,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    color: '#fff',
    fontSize: 15,
  },
  eyeBtn: {
    padding: 12,
  },
  eyeIcon: {
    fontSize: 20,
    color: '#6366f1',
  },
  checklist: { marginTop: 10, paddingLeft: 4, gap: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkIcon: { fontSize: 13, color: '#555', fontWeight: 'bold' },
  checkIconValid: { color: '#22c55e' },
  checkText: { fontSize: 12, color: '#666' },
  checkTextValid: { color: '#86efac', fontWeight: '500' },
  confirmHint: { marginTop: 6, fontSize: 12, fontWeight: '500' },
  confirmHintValid: { color: '#22c55e' },
  confirmHintInvalid: { color: '#ef4444' },
  termsContainer: { flexDirection: 'row', marginTop: 12, marginBottom: 8, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#1e1e3a', backgroundColor: '#0a0a16', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  termsTextWrap: { flex: 1 },
  termsText: { color: '#666', fontSize: 11, lineHeight: 16 },
  termsLink: { color: '#6366f1', fontWeight: '600' },
  termsWarningText: { color: '#eab308', fontSize: 12, marginBottom: 12, fontWeight: '500' },
  btn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnGrad: { padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginLink: { marginTop: 24, alignItems: 'center' },
  loginLinkText: { color: '#666', fontSize: 14 },
  accent: { color: '#6366f1', fontWeight: '700' },
});
