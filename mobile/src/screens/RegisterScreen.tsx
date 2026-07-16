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

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    if (!/\d/.test(password)) {
      Alert.alert('Weak Password', 'Password must contain at least one number.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      Alert.alert('Weak Password', 'Password must contain at least one uppercase letter.');
      return;
    }
    if (!agreed) {
      Alert.alert('Consent Required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    const result = await register(fullName.trim(), email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Registration Failed', result.error || 'Please try again.');
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a', '#060611']} style={styles.gradient}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -20}
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
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#444"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#444"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
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
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
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
                  onChangeText={setConfirm}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.termsContainer}>
              <TouchableOpacity 
                style={[styles.checkbox, agreed && styles.checkboxChecked]} 
                onPress={() => setAgreed(!agreed)}
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
  btn: { borderRadius: 14, overflow: 'hidden', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  btnGrad: { padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  termsContainer: { flexDirection: 'row', marginTop: 12, marginBottom: 8, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#1e1e3a', backgroundColor: '#0a0a16', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  termsTextWrap: { flex: 1 },
  termsText: { color: '#666', fontSize: 11, lineHeight: 16 },
  termsLink: { color: '#6366f1', fontWeight: '600' },
  loginLink: { marginTop: 24, alignItems: 'center' },
  loginLinkText: { color: '#666', fontSize: 14 },
  accent: { color: '#6366f1', fontWeight: '700' },
});
