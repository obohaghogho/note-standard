import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import WalletActionScreen from '../screens/WalletActionScreen';
import ExchangeScreen from '../screens/ExchangeScreen';

export type MainStackParamList = {
  MainTabs: undefined;
  NoteEditor: { noteId?: string };
  WalletAction: { type: 'deposit' | 'withdraw' | 'sell'; currency: string };
  Exchange: { mode?: 'convert' | 'buy' | 'sell' | 'swap' };
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
      <Stack.Screen
        name="Exchange"
        component={ExchangeScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
