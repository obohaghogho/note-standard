const { nanoid } = require('nanoid');

// This processor script mimics the frontend ChatContext.tsx behavior.
// When a message arrives, it emits a 'chat:delivered' ACK immediately.

function generateEventId() {
  return nanoid(12);
}

// Called before the scenario begins for a virtual user.
// We set up variables that the YAML file can use.
function setupVuser(context, events, done) {
  // context.vars contains variables from users.csv (user_id, email, password, access_token)
  // We can also generate a fake device ID
  context.vars.deviceId = `loadtest_device_${nanoid(8)}`;
  return done();
}

// Hook that runs before we emit a chat:message event
function beforeSendMessage(req, context, events, done) {
  // req is the socket payload array, e.g. [ 'chat:message', { ... } ]
  // We inject an eventId for idempotency, just like the real frontend
  if (req && req[1]) {
    req[1].eventId = generateEventId();
  }
  return done();
}

// Hook that runs when a custom message is received from the server
// Note: We need artillery-engine-socketio-v3 to process events, but a simpler way 
// is to use standard Artillery socket hooks.
function onChatMessage(context, events, done) {
  // If we receive a chat message, we should ideally emit an ACK.
  // Artillery's engine currently handles simple emit/response scenarios.
  // For complex asynchronous responses (like responding to unprompted server pushes),
  // custom JS logic with raw socket access might be needed.
  
  // Since artillery-engine-socketio v3 handles this specifically, we can use the `match` or `channel` blocks in YAML.
  return done();
}

module.exports = {
  setupVuser,
  beforeSendMessage,
  onChatMessage
};
