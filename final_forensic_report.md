# Final Forensic Report: Why Pushes and Double-Ticks Failed Globally

## The Root Cause
The root cause is an **Infrastructure Configuration** missing on the Realtime Gateway server.

Specifically: **The Realtime Gateway does not have the VAPID keys configured in its environment variables.**

## The Chain of Failure (Step-by-Step Proof)
Here is the exact sequence of what happens when User A sends a message to User B:

1. **The API Server Triggers the Push:**
   The API server successfully creates the message in the database and sends a POST request to `https://realtime-gateway-gsb5.onrender.com/internal/push` telling the Gateway to deliver the push notification.

2. **The Gateway Receives the Request:**
   The Gateway receives the HTTP POST and returns a `200 OK`. It successfully starts the push dispatch process.

3. **The Gateway Skips Web Push Silently:**
   Inside the Gateway's `pushService.js` (line 531), it checks if it has the cryptographic keys required to send a web push:
   ```javascript
   if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
     // ... fetch subscriptions and send web push
   }
   ```
   Because `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are **missing** from the Gateway's Render Dashboard, this entire block is evaluated as `false` and skipped.

4. **No Telemetry is Logged:**
   Because the Web Push block is skipped, the Gateway never even attempts to send the push, which is why your database shows exactly zero `attempted` or `failed` logs in the `push_metrics` table since the deployment.

5. **The Double-Tick Fails:**
   The "double-tick" delivery receipt relies on the phone receiving the push notification. The push payload contains a `deliveryWebhookUrl`. When the phone receives the push, it wakes up in the background and hits that webhook, which tells the Gateway to emit the double-tick. Because the Gateway never sent the push (Step 3), the phone never woke up, the webhook was never hit, and the double-tick never appeared.

## Why this happened during this specific deployment
Before this deployment, the **API Server** was handling Web Pushes. You correctly configured the VAPID keys in the API Server's environment variables months ago, so it worked perfectly.

During this deployment, we moved 100% of the Web Push logic out of the API Server and into the **Realtime Gateway** to eliminate race conditions and centralize the architecture. However, the Realtime Gateway is a separate service on Render, and it never had those VAPID keys pasted into its dashboard.

## The Fix (Action Required)
This is not a code bug; the code is doing exactly what it was designed to do (failing safely when it lacks cryptographic keys). I cannot fix this via a code patch.

You must manually copy the keys over in your Render Dashboard:
1. Open the Render Dashboard for your **API Server**.
2. Go to **Environment**, and copy the values for:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
3. Open the Render Dashboard for your **Realtime Gateway**.
4. Go to **Environment**, add those exact same two variables, and save.

Once Render automatically restarts the Gateway, push notifications and double-ticks will immediately resume working.
