import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import WalletActionScreen from '../screens/WalletActionScreen';
import ExchangeScreen from '../screens/ExchangeScreen';

// Parity secondary screens
import VirtualAccountModal from '../screens/wallet/VirtualAccountModal';
import TransferScreen from '../screens/wallet/TransferScreen';
import WithdrawalOtpModal from '../screens/wallet/WithdrawalOtpModal';
import BankAccountsScreen from '../screens/wallet/BankAccountsScreen';
import ShareNoteModal from '../screens/notes/ShareNoteModal';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import TeamDetailScreen from '../screens/teams/TeamDetailScreen';
import CreateTeamModal from '../screens/teams/CreateTeamModal';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import SearchScreen from '../screens/search/SearchScreen';
import UserIssueTrackerScreen from '../screens/support/UserIssueTrackerScreen';
import SecuritySettingsScreen from '../screens/profile/SecuritySettingsScreen';
import { ProfileEditScreen } from '../screens/profile/ProfileEditScreen';
import { KycVerificationScreen } from '../screens/profile/KycVerificationScreen';
import { CommunityFeedScreen } from '../screens/community/CommunityFeedScreen';
import { AffiliateScreen } from '../screens/affiliate/AffiliateScreen';
import { AdsDashboardScreen } from '../screens/ads/AdsDashboardScreen';
import { CampaignBuilderScreen } from '../screens/ads/CampaignBuilderScreen';
import { SubscriptionPlansScreen } from '../screens/subscription/SubscriptionPlansScreen';
import { BillingHistoryScreen } from '../screens/subscription/BillingHistoryScreen';

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

      {/* Parity Secondary Screens & Modals */}
      <Stack.Screen
        name="VirtualAccountDetails"
        component={VirtualAccountModal}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Transfer"
        component={TransferScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="WithdrawalOtp"
        component={WithdrawalOtpModal}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="BankAccounts"
        component={BankAccountsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ShareNote"
        component={ShareNoteModal}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ProfileEdit"
        component={ProfileEditScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="KycVerification"
        component={KycVerificationScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CommunityFeed"
        component={CommunityFeedScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Affiliate"
        component={AffiliateScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AdsDashboard"
        component={AdsDashboardScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CampaignBuilder"
        component={CampaignBuilderScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SubscriptionPlans"
        component={SubscriptionPlansScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="BillingHistory"
        component={BillingHistoryScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="TeamDetail"
        component={TeamDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="CreateTeam"
        component={CreateTeamModal}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="UserIssueTracker"
        component={UserIssueTrackerScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SecuritySettings"
        component={SecuritySettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
