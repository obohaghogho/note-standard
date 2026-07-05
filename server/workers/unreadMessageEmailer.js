const supabase = require('../config/database');
const sendgridEmailService = require('../services/sendgridEmailService');
const logger = require('../utils/logger');

/**
 * Worker that scans for undelivered messages and sends fallback emails
 * to offline users based on their preferences.
 */
class UnreadMessageEmailer {
  async process() {
    try {
      logger.info('[UnreadMessageEmailer] Starting fallback scan...');

      // Get current time
      const now = new Date();
      const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
      const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

      // 1. Fetch undelivered messages
      // We look for messages that:
      // - Are NOT delivered
      // - Email NOT sent yet
      // - Older than 2 mins (we'll filter the 15-min ones in memory to avoid complex .or() PostgREST errors)
      const { data: messagesRaw, error } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          type,
          created_at,
          sender_id,
          conversation_id
        `)
        .is('delivered_at', null)
        .eq('email_sent', false)
        .lt('created_at', twoMinsAgo);

      if (error) {
        throw new Error(`DB Error fetching undelivered messages: ${error.message}`);
      }

      if (!messagesRaw || messagesRaw.length === 0) {
        return; // Nothing to process
      }

      // Memory filter: Calls > 2 mins, Chats > 15 mins
      const messages = messagesRaw.filter(msg => {
        if (msg.type === 'call_incoming') return true;
        return new Date(msg.created_at) < new Date(fifteenMinsAgo);
      });

      if (messages.length === 0) return;

      // 1b. Fetch Conversation Members (since messages -> auth.users FK breaks PostgREST joins to profiles)
      const convIds = [...new Set(messages.map(m => m.conversation_id))];
      const { data: membersData } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', convIds);

      // 1c. Fetch Sender Profiles
      const senderIds = [...new Set(messages.map(m => m.sender_id))];
      const { data: senderProfiles } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .in('id', senderIds);

      const sendersMap = {};
      (senderProfiles || []).forEach(p => sendersMap[p.id] = p);

      const membersMap = {};
      (membersData || []).forEach(m => {
        if (!membersMap[m.conversation_id]) membersMap[m.conversation_id] = [];
        membersMap[m.conversation_id].push(m);
      });

      // 2. Group messages by Receiver -> Sender
      const emailsToSend = {}; // receiverId -> { senders: { senderId: { count, name, type } } }
      const processedMessageIds = [];

      for (const msg of messages) {
        processedMessageIds.push(msg.id);
        const members = membersMap[msg.conversation_id] || [];
        
        for (const member of members) {
          const receiverId = member.user_id;
          if (receiverId === msg.sender_id) continue;

          if (!emailsToSend[receiverId]) {
            emailsToSend[receiverId] = { senders: {}, link: '' };
          }

          if (!emailsToSend[receiverId].senders[msg.sender_id]) {
            const s = sendersMap[msg.sender_id] || {};
            emailsToSend[receiverId].senders[msg.sender_id] = {
              name: s.full_name || s.username || 'Someone',
              count: 0,
              hasCall: false
            };
          }

          emailsToSend[receiverId].senders[msg.sender_id].count += 1;
          if (msg.type === 'call_incoming') {
            emailsToSend[receiverId].senders[msg.sender_id].hasCall = true;
          }
          
          // Use the first conversation link for simplicity
          emailsToSend[receiverId].link = `${process.env.CLIENT_URL || 'https://notestandard.com'}/dashboard/chat?id=${msg.conversation_id}`;
        }
      }

      // 3. Process each receiver
      const receiverIds = Object.keys(emailsToSend);
      if (receiverIds.length === 0) return;

      const { data: receivers, error: recvError } = await supabase
        .from('profiles')
        .select('id, email, is_online, email_notifications')
        .in('id', receiverIds);

      if (recvError) {
        throw new Error(`DB Error fetching receivers: ${recvError.message}`);
      }

      // Filter to only OFFLINE receivers who allow emails
      const targetReceivers = receivers.filter(r => {
        if (r.is_online) return false;
        if (r.email_notifications === 'none') return false;
        return true;
      });

      // 4. Dispatch Emails
      const dispatchPromises = [];
      for (const receiver of targetReceivers) {
        const payload = emailsToSend[receiver.id];
        if (!payload) continue;

        for (const senderId in payload.senders) {
          const sData = payload.senders[senderId];
          dispatchPromises.push(
            sendgridEmailService.sendUnreadMessagesEmail(receiver.email, {
              senderName: sData.name,
              count: sData.count,
              link: payload.link,
              type: sData.hasCall ? 'call' : 'message'
            })
          );
        }
      }

      if (dispatchPromises.length > 0) {
        await Promise.allSettled(dispatchPromises);
        logger.info(`[UnreadMessageEmailer] Sent ${dispatchPromises.length} fallback emails.`);
      }

      // 5. Mark messages as email_sent so we don't process them again
      if (processedMessageIds.length > 0) {
        // We chunk the update to avoid payload limits
        const chunkSize = 100;
        for (let i = 0; i < processedMessageIds.length; i += chunkSize) {
          const chunk = processedMessageIds.slice(i, i + chunkSize);
          await supabase
            .from('messages')
            .update({ email_sent: true })
            .in('id', chunk);
        }
        logger.info(`[UnreadMessageEmailer] Marked ${processedMessageIds.length} messages as email_sent.`);
      }

    } catch (err) {
      logger.error(`[UnreadMessageEmailer] Error: ${err.message}`);
    }
  }
}

module.exports = new UnreadMessageEmailer();
