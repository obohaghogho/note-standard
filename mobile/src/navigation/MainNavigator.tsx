import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';
import { Home, MessageCircle, Globe, Settings } from 'lucide-react-native';

import { NotesDashboard } from '../screens/notes/NotesDashboard';
import { NoteEditor } from '../screens/notes/NoteEditor';

const HomeIcon = Home as any;
const MessageCircleIcon = MessageCircle as any;
const GlobeIcon = Globe as any;
const SettingsIcon = Settings as any;

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
            options={{ tabBarIcon: ({ color }) => <HomeIcon size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Chat"
            component={() => <DummyScreen name="Chat" />}
            options={{ tabBarIcon: ({ color }) => <MessageCircleIcon size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Feed"
            component={() => <DummyScreen name="Feed" />}
            options={{ tabBarIcon: ({ color }) => <GlobeIcon size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Account"
            component={() => <DummyScreen name="Account" />}
            options={{ tabBarIcon: ({ color }) => <SettingsIcon size={24} color={color} /> }}
        />
    </Tab.Navigator>
);
