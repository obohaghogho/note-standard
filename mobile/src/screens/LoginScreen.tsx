import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { AuthStackParamList } from '../navigation/AuthStack';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Login Failed', result.error || 'Please check your credentials.');
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a', '#060611']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo / Brand */}
          <View style={styles.brand}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.appName}>NoteStandard</Text>
            <Text style={styles.tagline}>Connect. Chat. Create.</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSubtitle}>Sign in to your account</Text>

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
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#444"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.loginGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.registerLink} onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLinkText}>
                Don't have an account? <Text style={styles.registerLinkAccent}>Sign Up</Text>
              </Text>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, shadowColor: '#6366f1', shadowOpacity: 0.6, shadowRadius: 20,
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  appName: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: '#666', fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: '#111122', borderRadius: 24, padding: 28,
    borderWidth: 1, borderColor: '#1e1e3a',
  },
  cardTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  cardSubtitle: { color: '#666', fontSize: 14, marginBottom: 28 },
  inputGroup: { marginBottom: 18 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#0a0a16', borderWidth: 1, borderColor: '#1e1e3a',
    borderRadius: 14, padding: 16, color: '#fff', fontSize: 15,
  },
  loginBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  loginGrad: { padding: 16, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerLink: { marginTop: 24, alignItems: 'center' },
  registerLinkText: { color: '#666', fontSize: 14 },
  registerLinkAccent: { color: '#6366f1', fontWeight: '700' },
});
