export const getConversationRecencyTime = (conv: any): number => {
    if (!conv) return 0;
    const parseTime = (val: any): number => {
        if (!val) return 0;
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
    };
    const lm = conv.lastMessage || conv.last_message;
    const lmTime = parseTime(lm?.created_at);
    const updatedAtTime = parseTime(conv.updated_at);
    const lastMsgAtTime = parseTime(conv.last_message_at);
    return Math.max(lmTime, updatedAtTime, lastMsgAtTime);
};
