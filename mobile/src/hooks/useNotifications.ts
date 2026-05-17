import { useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { registerForPushNotificationsAsync } from '../utils/notifications';

export const useNotifications = () => {
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            registerForPushNotificationsAsync().then(token => {
                if (token) {
                    supabase
                        .from('profiles')
                        .update({ expo_push_token: token })
                        .eq('id', user.id);
                }
            });
        }

        const subscription = Notifications.addNotificationReceivedListener(notification => {
            console.log('Notification received:', notification);
        });

        return () => subscription.remove();
    }, [user]);
};
