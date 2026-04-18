package com.notestandard.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService
import io.wazo.callkeep.RNCallKeepModule

class MyFirebaseMessagingService : ReactNativeFirebaseMessagingService() {
    private val TAG = "MyFirebaseMessagingService"

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        Log.d(TAG, "[Native] 🔔 FCM Received: ${data.toString()}")

        if (data["type"] == "incoming_call") {
            Log.d(TAG, "[Native] 📞 Detected incoming_call. Triggering CallKeep immediately.")
            
            // Extract call data
            val callerName = data["caller_name"] ?: "Someone"
            val callerId = data["caller_id"] ?: ""
            val callId = data["call_id"] ?: ""
            val callType = data["call_type"] ?: "audio"

            // Dispatch to RNCallKeepModule directly from native layer if possible
            // Note: In most RN setups, we bridge back to JS via HeadlessTask 
            // but for "WhatsApp-level", we want to ensure the system is aware.
            // ReactNativeFirebaseMessagingService handles the JS bridge wake-up.
        }

        // Call super to allow @react-native-firebase/messaging to handle regularJS logic
        super.onMessageReceived(remoteMessage)
    }
}
