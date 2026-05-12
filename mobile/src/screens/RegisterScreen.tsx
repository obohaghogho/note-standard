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
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
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
            {[
              { label: 'Full Name', value: fullName, setter: setFullName, placeholder: 'John Doe', type: 'default' },
              { label: 'Email', value: email, setter: setEmail, placeholder: 'you@example.com', type: 'email-address' },
              { label: 'Password', value: password, setter: setPassword, placeholder: '••••••••', secure: true },
              { label: 'Confirm Password', value: confirm, setter: setConfirm, placeholder: '••••••••', secure: true },
            ].map((field) => (
              <View style={styles.inputGroup} key={field.label}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={field.placeholder}
                  placeholderTextColor="#444"
                  value={field.value}
                  onChangeText={field.setter}
                  secureTextEntry={field.secure}
                  keyboardType={(field.type as any) || 'default'}
                  autoCapitalize={field.type === 'email-address' ? 'none' : 'words'}
                  autoCorrect={false}
                />
              </View>
            ))}

            <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
              <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
  btn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  btnGrad: { padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginLink: { marginTop: 24, alignItems: 'center' },
  loginLinkText: { color: '#666', fontSize: 14 },
  accent: { color: '#6366f1', fontWeight: '700' },
});
