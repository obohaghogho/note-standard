package com.notestandard.app

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService

class MyFirebaseMessagingService : ReactNativeFirebaseMessagingService() {
    private val TAG = "MyFirebaseMessagingService"

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        Log.d(TAG, "[Native] FCM Received: ${data}")

        if (data["type"] == "incoming_call") {
            Log.d(TAG, "[Native] Detected incoming_call. Allowing Firebase JS bridge to handle.")
            // ReactNativeFirebaseMessagingService handles waking up the JS layer.
            // The JS layer (via setBackgroundMessageHandler) will call CallKeep.
        }

        // Call super to allow @react-native-firebase/messaging to handle all JS logic
        super.onMessageReceived(remoteMessage)
    }
}

