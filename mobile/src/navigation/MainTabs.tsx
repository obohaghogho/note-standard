import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import FeedScreen from '../screens/FeedScreen';
import { CommunityFeedScreen } from '../screens/community/CommunityFeedScreen';
import ChatStack from './ChatStack';
import NotesScreen from '../screens/NotesScreen';
import WalletScreen from '../screens/WalletScreen';
import TeamsScreen from '../screens/TeamsScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type MainTabParamList = {
  Home: undefined;
  Community: undefined;
  ChatTab: undefined;
  Wallet: undefined;
  Teams: undefined;
  Notes: undefined;
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
  const lastTabPressRef = React.useRef(0);

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
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          const now = Date.now();
          if (now - lastTabPressRef.current < 350) {
            e.preventDefault();
          } else {
            lastTabPressRef.current = now;
          }
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={FeedScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityFeedScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" label="Community" focused={focused} /> }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatStack}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chat" focused={focused} /> }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💳" label="Wallet" focused={focused} /> }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👥" label="Teams" focused={focused} /> }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📝" label="Notes" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
