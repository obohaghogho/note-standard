import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import FriendSearchScreen from '../screens/FriendSearchScreen';
import { Conversation } from '../services/ChatService';

export type ChatStackParamList = {
  ChatList: undefined;
  Chat: { conversationId: string; conversation: Conversation };
  FriendSearch: undefined;
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export default function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="FriendSearch" component={FriendSearchScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
