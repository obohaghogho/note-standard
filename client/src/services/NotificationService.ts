export class NotificationService {
    static async requestPermission() {
        if (!('Notification' in window)) {
            console.log('This browser does not support desktop notification');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }

    static show(title: string, options?: NotificationOptions) {
        if (Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            return new Notification(title, {
                icon: '/logo.png', // Fallback to logo
                badge: '/logo.png',
                ...options
            });
        }
        return null;
    }

    static notifyNewMessage(senderName: string, content: string, conversationId: string) {
        return this.show(`New message from ${senderName}`, {
            body: content,
            tag: conversationId, // Group notifications by conversation
            renotify: true
        } as any);
    }

    static notifyNewSupportChat(userName: string) {
        return this.show('New Support Chat', {
            body: `${userName} just started a new support conversation.`,
            tag: 'new_chat',
            requireInteraction: true
        });
    }
}
