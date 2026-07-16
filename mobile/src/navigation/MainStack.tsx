import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import WalletActionScreen from '../screens/WalletActionScreen';

export type MainStackParamList = {
  MainTabs: undefined;
  NoteEditor: { noteId?: string };
  WalletAction: { type: 'deposit' | 'withdraw'; currency: string };
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen 
        name="NoteEditor" 
        component={NoteEditorScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen 
        name="WalletAction" 
        component={WalletActionScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
