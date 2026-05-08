import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import FeedScreen from '../screens/FeedScreen';
import ChatStack from './ChatStack';
import NotesScreen from '../screens/NotesScreen';
import { FriendsList } from '../components/FriendsList';
import ProfileScreen from '../screens/ProfileScreen';

export type MainTabParamList = {
  Home: undefined;
  Chat: undefined;
  Notes: undefined;
  Social: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 6 }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
      <Text style={{ fontSize: 9, marginTop: 2, color: focused ? '#6366f1' : '#555', fontWeight: focused ? '700' : '400' }}>
        {label}
      </Text>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a16',
          borderTopColor: '#111133',
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 10,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={FeedScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStack}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chat" focused={focused} /> }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📝" label="Notes" focused={focused} /> }}
      />
      <Tab.Screen
        name="Social"
        component={FriendsList}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👥" label="Social" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
