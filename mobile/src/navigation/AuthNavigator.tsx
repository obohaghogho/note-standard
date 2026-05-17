import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const Stack = createStackNavigator();

// Simple Login Screen Placeholder
const LoginScreen = () => (
    <View style={styles.container}>
        <Text style={styles.title}>Welcome to NoteStandard</Text>
        <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Login</Text>
        </Pressable>
    </View>
);

export const AuthNavigator = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={() => <View />} />
    </Stack.Navigator>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center', padding: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 40 },
    button: { backgroundColor: '#6366f1', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12 },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
