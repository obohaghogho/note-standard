export interface NotificationLinkOptions {
    type?: string;
    link?: string;
    conversationId?: string;
    userRole?: string;
}

/**
 * Robustly resolves the target destination route for any notification type.
 * Ensures chat notifications always map to `/dashboard/chat?id=<conversationId>`.
 */
export const resolveNotificationLink = (notif: NotificationLinkOptions): string => {
    const type = notif.type || '';
    const link = notif.link || '';

    // 1. Support Chat check
    const isSupport =
        type.startsWith('support') ||
        type === 'new_support_ticket' ||
        type === 'ai_support_reply' ||
        link.includes('openSupport') ||
        link.includes('support');

    if (isSupport) {
        let convId = notif.conversationId;
        if (!convId && link) {
            const match = link.match(/[?&]id=([^&]+)/);
            if (match) convId = match[1];
        }

        const isAdminOrSupport = notif.userRole === 'admin' || notif.userRole === 'support' || notif.userRole === 'super_admin';
        if (isAdminOrSupport) {
            return link && link.includes('/admin')
                ? link
                : `/admin/chats${convId ? `?id=${convId}` : ''}`;
        }
        return `/dashboard/chat?openSupport=true${convId ? `&id=${convId}` : ''}`;
    }

    // 2. Chat Message / Request / Accepted check
    const isChat =
        type === 'chat_message' ||
        type === 'chat_request' ||
        type === 'chat_accepted' ||
        type === 'message' ||
        link.includes('/chat') ||
        !!notif.conversationId;

    if (isChat) {
        let convId = notif.conversationId;
        if (!convId && link) {
            const match = link.match(/[?&]id=([^&]+)/) || link.match(/\/chat\/([^&/?]+)/);
            if (match) convId = match[1];
        }

        if (convId) {
            return `/dashboard/chat?id=${convId}`;
        }
        if (link && link.trim() !== '') {
            return link;
        }
        return '/dashboard/chat';
    }

    // 3. General notifications with explicit link
    if (link && link.trim() !== '') {
        return link;
    }

    return '/dashboard';
};
