const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));
const { createNotification } = require('../services/notificationService');
const { detectLanguage } = require('../services/translationService');

// --- Conversations ---

exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch conversations where user is a member
        const { data, error } = await supabase
            .from('conversation_members')
            .select(`
                conversation:conversations (
                    id,
                    type,
                    name,
                    updated_at,
                    members:conversation_members (
                        user_id,
                        role,
                        status,
                        profile:profiles (
                            username,
                            full_name,
                            avatar_url
                        )
                    )
                )
            `)
            .eq('user_id', userId)
            .order('joined_at', { ascending: false });

        if (error) throw error;

        // Transform structure for client
        const conversations = data.map(item => item.conversation);
        res.json(conversations);
    } catch (err) {
        console.error('Error fetching conversations:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.createConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, name, participants: recipientUsernames } = req.body;
        // recipients: array of usernames

        if (!recipientUsernames || recipientUsernames.length === 0) {
            return res.status(400).json({ error: 'Participants (usernames) required' });
        }

        // 1. Resolve Usernames to IDs
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, username')
            .in('username', recipientUsernames);

        if (profileError || !profiles || profiles.length !== recipientUsernames.length) {
            return res.status(404).json({ error: 'One or more users not found' });
        }

        const participantIds = profiles.map(p => p.id);

        // 2. Create Conversation
        const { data: convData, error: convError } = await supabase
            .from('conversations')
            .insert([{ type, name }])
            .select()
            .single();

        if (convError) throw convError;
        const conversationId = convData.id;

        // 3. Prepare Members Payload
        // Add creator (Admin, Accepted)
        const membersPayload = [
            {
                conversation_id: conversationId,
                user_id: userId,
                role: 'admin',
                status: 'accepted'
            }
        ];

        // Add other participants (Member, Pending)
        for (const pId of participantIds) {
            membersPayload.push({
                conversation_id: conversationId,
                user_id: pId,
                role: 'member',
                status: 'pending'
            });
        }

        const { error: memberError } = await supabase
            .from('conversation_members')
            .insert(membersPayload);

        if (memberError) throw memberError;

        res.json({ conversation: convData, members: membersPayload, resolvedParticipants: profiles });

    } catch (err) {
        console.error('Error creating conversation:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.acceptConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;

        // Update status to accepted for this user in this conversation
        const { data, error } = await supabase
            .from('conversation_members')
            .update({ status: 'accepted' })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        res.json({ success: true, member: data });
    } catch (err) {
        console.error('Error accepting conversation:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

// --- Messages ---

exports.getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, before } = req.query;

        let query = supabase
            .from('messages')
            .select(`
                *,
                attachment:media_attachments(*)
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;

        if (error) throw error;
        // Return in chronological order for the client
        res.json(data.reverse());
    } catch (err) {
        console.error('Error fetching messages:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.searchMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { q } = req.query;

        if (!q) return res.status(400).json({ error: 'Search query required' });

        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                attachment:media_attachments(*)
            `)
            .eq('conversation_id', conversationId)
            .ilike('content', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error searching messages:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.markMessageRead = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', messageId)
            .neq('sender_id', userId) // Only mark as read if not the sender
            .select()
            .single();

        if (error) throw error;

        // Emit read receipt via socket
        const io = req.app.get('io');
        io.to(data.conversation_id).emit('message_read', {
            messageId,
            conversationId: data.conversation_id,
            userId
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error marking message read:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type } = req.body;
        const userId = req.user.id;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        // Analysis: Sentiment (if text)
        let sentiment = null;
        let detectedLang = 'en';

        if ((type === 'text' || !type) && content) {
            const Sentiment = require('sentiment');
            const analyzer = new Sentiment();
            const result = analyzer.analyze(content);
            sentiment = {
                score: result.score,
                comparative: result.comparative,
                label: result.score > 0 ? 'positive' : result.score < 0 ? 'negative' : 'neutral'
            };

            // Detect Language
            detectedLang = await detectLanguage(content);
        }

        const { data, error } = await supabase
            .from('messages')
            .insert([{
                conversation_id: conversationId,
                sender_id: userId,
                content: content,
                type: type || 'text',
                sentiment: sentiment,
                original_language: detectedLang,
                attachment_id: req.body.attachmentId || null
            }])
            .select()
            .single();

        if (error) throw error;

        // Update conversation timestamp
        await supabase
            .from('conversations')
            .update({ updated_at: new Date() })
            .eq('id', conversationId);

        // Fetch with attachment details for real-time recipients
        const { data: fullMessage, error: fetchErr } = await supabase
            .from('messages')
            .select('*, attachment:media_attachments(*)')
            .eq('id', data.id)
            .single();

        if (!fetchErr && fullMessage) {
            const io = req.app.get('io');
            io.to(conversationId).emit('receive_message', fullMessage);
        }

        res.json(fullMessage || data);

        // --- Notification Logic ---
        const io = req.app.get('io');
        try {
            // Get conversation members to notify them
            const { data: members, error: memberError } = await supabase
                .from('conversation_members')
                .select('user_id')
                .eq('conversation_id', conversationId)
                .neq('user_id', userId); // Don't notify the sender

            if (!memberError && members) {
                // Fetch sender info for the notification title
                const { data: sender } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', userId)
                    .single();

                for (const member of members) {
                    await createNotification({
                        receiverId: member.user_id,
                        senderId: userId,
                        type: 'chat_message',
                        title: 'New Message',
                        message: `${sender?.username || 'Someone'} sent you a message: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
                        link: `/chat/${conversationId}`,
                        io
                    });
                }
            }

            // --- Mention Logic ---
            const mentions = content.match(/@(\w+)/g);
            if (mentions) {
                const usernames = mentions.map(m => m.substring(1));
                const { data: mentionedUsers } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('username', usernames);

                if (mentionedUsers) {
                    // Fetch sender info if not already fetched
                    const senderName = (await supabase.from('profiles').select('username').eq('id', userId).single()).data?.username || 'Someone';

                    for (const mUser of mentionedUsers) {
                        if (mUser.id !== userId) { // Don't notify self
                            await createNotification({
                                receiverId: mUser.id,
                                senderId: userId,
                                type: 'mention',
                                title: 'You were mentioned',
                                message: `${senderName} mentioned you in a chat: "${content.substring(0, 50)}..."`,
                                link: `/chat/${conversationId}`,
                                io
                            });
                        }
                    }
                }
            }
        } catch (notifErr) {
            console.error('Failed to send notification or mention:', notifErr);
        }

        // --- AI Auto-Reply Logic ---
        try {
            // 1. Check if this is a support chat and sender is the user (not admin)
            const { data: conv } = await supabase
                .from('conversations')
                .select('chat_type, support_status')
                .eq('id', conversationId)
                .single();

            if (conv?.chat_type === 'support') {
                // 2. Fetch auto-reply settings
                const { data: settings } = await supabase
                    .from('auto_reply_settings')
                    .select('*')
                    .single();

                if (settings?.enabled) {
                    // 3. Check offline hours
                    const now = new Date();
                    const hours = now.getUTCHours(); // Simple UTC check for now
                    const start = parseInt(settings.start_hour.split(':')[0]);
                    const end = parseInt(settings.end_hour.split(':')[0]);

                    let isOffline = false;
                    if (start > end) { // Overnights (e.g., 18:00 to 09:00)
                        isOffline = hours >= start || hours < end;
                    } else {
                        isOffline = hours >= start && hours < end;
                    }

                    if (isOffline) {
                        // 4. Send auto-reply message
                        const { data: autoMsg, error: autoErr } = await supabase
                            .from('messages')
                            .insert([{
                                conversation_id: conversationId,
                                sender_id: '00000000-0000-0000-0000-000000000000', // System/Bot ID
                                content: settings.message,
                                type: 'text'
                            }])
                            .select()
                            .single();

                        if (!autoErr) {
                            io.to(conversationId).emit('receive_message', autoMsg);
                        }
                    }
                }
            }
        } catch (autoReplyErr) {
            console.error('Auto-reply logic failed:', autoReplyErr);
        }

    } catch (err) {
        console.error('Error sending message:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

// Create support chat - User contacts admin
exports.createSupportChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const { subject } = req.body;

        // Check if user already has an open support chat
        const { data: existingChats } = await supabase
            .from('conversations')
            .select(`
                id,
                support_status,
                members:conversation_members!inner (user_id)
            `)
            .eq('chat_type', 'support')
            .neq('support_status', 'resolved')
            .eq('members.user_id', userId);

        if (existingChats && existingChats.length > 0) {
            return res.status(400).json({
                error: 'You already have an open support chat',
                existingChatId: existingChats[0].id
            });
        }

        // Get user profile for chat name
        const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single();

        // Create support conversation
        const chatName = subject || `Support: ${profile?.username || 'User'}`;
        const { data: convData, error: convError } = await supabase
            .from('conversations')
            .insert([{
                type: 'direct',
                name: chatName,
                chat_type: 'support',
                support_status: 'open'
            }])
            .select()
            .single();

        if (convError) throw convError;

        // Add user as member
        const { error: memberError } = await supabase
            .from('conversation_members')
            .insert([{
                conversation_id: convData.id,
                user_id: userId,
                role: 'member',
                status: 'accepted'
            }]);

        if (memberError) throw memberError;

        // Notify admins via Socket.IO
        const io = req.app.get('io');
        io.to('admin_room').emit('new_support_chat', {
            ...convData,
            user: profile
        });

        res.json({ conversation: convData });
    } catch (err) {
        console.error('Error creating support chat:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};
