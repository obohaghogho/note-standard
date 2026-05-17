import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text } from 'react-native';
import { Home, MessageCircle, Globe, Settings } from 'lucide-react-native';

import { NotesDashboard } from '../screens/notes/NotesDashboard';
import { NoteEditor } from '../screens/notes/NoteEditor';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const NotesStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Dashboard" component={NotesDashboard} />
        <Stack.Screen name="NoteEditor" component={NoteEditor} />
    </Stack.Navigator>
);

// Placeholders for screens
const DummyScreen = ({ name }: { name: string }) => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
        <Text style={{ color: '#fff' }}>{name} Screen</Text>
    </View>
);

export const MainNavigator = () => (
    <Tab.Navigator
        screenOptions={{
            headerShown: true,
            tabBarStyle: {
                backgroundColor: '#0f172a',
                borderTopWidth: 0,
                height: 60,
                paddingBottom: 10
            },
            tabBarActiveTintColor: '#6366f1',
            tabBarInactiveTintColor: '#94a3b8',
            headerStyle: { backgroundColor: '#0f172a' },
            headerTintColor: '#fff',
        }}
    >
        <Tab.Screen
            name="Notes"
            component={NotesStack}
            options={{ tabBarIcon: ({ color }) => <Home size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Chat"
            component={() => <DummyScreen name="Chat" />}
            options={{ tabBarIcon: ({ color }) => <MessageCircle size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Feed"
            component={() => <DummyScreen name="Feed" />}
            options={{ tabBarIcon: ({ color }) => <Globe size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Account"
            component={() => <DummyScreen name="Account" />}
            options={{ tabBarIcon: ({ color }) => <Settings size={24} color={color} /> }}
        />
    </Tab.Navigator>
);
