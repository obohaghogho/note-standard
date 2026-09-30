import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';

export type MainStackParamList = {
  MainTabs: undefined;
  CommunityFeed: undefined;
  Affiliate: undefined;
  AdsDashboard: undefined;
  CampaignBuilder: undefined;
  SubscriptionPlans: undefined;
  BillingHistory: undefined;
  NoteEditor: { noteId?: string };
  WalletAction: { type: 'deposit' | 'withdraw' | 'sell'; currency: string };
  Exchange: { mode?: 'convert' | 'buy' | 'sell' | 'swap' };
  VirtualAccountDetails: { currency?: string };
  Transfer: { currency?: string };
  WithdrawalOtp: { withdrawal_reference: string; fincra_reference?: string; trace_id?: string; amount?: number; currency?: string };
  BankAccounts: undefined;
  ShareNote: { noteId?: string; noteTitle?: string };
  PublicProfile: { userId: string };
  ProfileEdit: undefined;
  KycVerification: undefined;
  TeamDetail: { teamId: string };
  CreateTeam: undefined;
  Notifications: undefined;
  Search: undefined;
  UserIssueTracker: undefined;
  SecuritySettings: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="NoteEditor"
        getComponent={() => require('../screens/NoteEditorScreen').default}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="WalletAction"
        getComponent={() => require('../screens/WalletActionScreen').default}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Exchange"
        getComponent={() => require('../screens/ExchangeScreen').default}
        options={{ animation: 'slide_from_bottom' }}
      />

      {/* Parity Secondary Screens & Modals */}
      <Stack.Screen
        name="VirtualAccountDetails"
        getComponent={() => require('../screens/wallet/VirtualAccountModal').default}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Transfer"
        getComponent={() => require('../screens/wallet/TransferScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="WithdrawalOtp"
        getComponent={() => require('../screens/wallet/WithdrawalOtpModal').default}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="BankAccounts"
        getComponent={() => require('../screens/wallet/BankAccountsScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ShareNote"
        getComponent={() => require('../screens/notes/ShareNoteModal').default}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PublicProfile"
        getComponent={() => require('../screens/profile/PublicProfileScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ProfileEdit"
        getComponent={() => require('../screens/profile/ProfileEditScreen').ProfileEditScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="KycVerification"
        getComponent={() => require('../screens/profile/KycVerificationScreen').KycVerificationScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CommunityFeed"
        getComponent={() => require('../screens/community/CommunityFeedScreen').CommunityFeedScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Affiliate"
        getComponent={() => require('../screens/affiliate/AffiliateScreen').AffiliateScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AdsDashboard"
        getComponent={() => require('../screens/ads/AdsDashboardScreen').AdsDashboardScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CampaignBuilder"
        getComponent={() => require('../screens/ads/CampaignBuilderScreen').CampaignBuilderScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SubscriptionPlans"
        getComponent={() => require('../screens/subscription/SubscriptionPlansScreen').SubscriptionPlansScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="BillingHistory"
        getComponent={() => require('../screens/subscription/BillingHistoryScreen').BillingHistoryScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="TeamDetail"
        getComponent={() => require('../screens/teams/TeamDetailScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CreateTeam"
        getComponent={() => require('../screens/teams/CreateTeamModal').default}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Notifications"
        getComponent={() => require('../screens/notifications/NotificationsScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Search"
        getComponent={() => require('../screens/search/SearchScreen').default}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="UserIssueTracker"
        getComponent={() => require('../screens/support/UserIssueTrackerScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SecuritySettings"
        getComponent={() => require('../screens/profile/SecuritySettingsScreen').default}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
