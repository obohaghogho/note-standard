/**
 * Payload Normalization Layer
 * Enforces schema safety and null-stripping before broadcasting to websocket clients.
 */

const { socketLogger } = require('./logger');
const diagnosticLogger = require('./diagnosticLogger');

const stripUndefinedAndNull = (obj) => {
    if (Array.isArray(obj)) {
        return obj.map(stripUndefinedAndNull).filter(item => item !== undefined && item !== null);
    } else if (obj !== null && typeof obj === 'object') {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null) {
                acc[key] = stripUndefinedAndNull(value);
            }
            return acc;
        }, {});
    }
    return obj;
};

const normalizeOutboundMessage = (rawMessage) => {
    try {
        if (!rawMessage || typeof rawMessage !== 'object') {
            diagnosticLogger.logQuarantine('INVALID_PAYLOAD_TYPE', rawMessage);
            return null;
        }
        
        // Ensure required fields
        const required = ['id', 'conversation_id', 'sender_id', 'created_at', 'sequence_number', 'event_id'];
        const missingFields = required.filter(req => !(req in rawMessage));
        
        if (missingFields.length > 0) {
            diagnosticLogger.logQuarantine('MISSING_REQUIRED_FIELDS', rawMessage, { missingFields });
            socketLogger.error('Payload normalization failed, quarantining event', { missingFields });
            return null;
        }
        
        // Strip out unsafe properties, ensure timestamps are strings
        const safePayload = stripUndefinedAndNull({
            ...rawMessage,
            server_timestamp: new Date().toISOString()
        });
        
        return safePayload;
    } catch (err) {
        diagnosticLogger.logQuarantine('NORMALIZATION_CRASH', rawMessage);
        socketLogger.error('Payload normalization failed, quarantining event', { error: err.message });
        return null;
    }
};

module.exports = {
    normalizeOutboundMessage,
    stripUndefinedAndNull
};
