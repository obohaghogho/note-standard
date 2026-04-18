import Foundation
import PushKit
import CallKit

@objc(VoIPPushDelegate)
class VoIPPushDelegate: NSObject, PKPushRegistryDelegate {
    static let shared = VoIPPushDelegate()
    
    private var provider: CXProvider?

    override init() {
        super.init()
        let config = CXProviderConfiguration(localizedName: "NoteStandard")
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        
        provider = CXProvider(configuration: config)
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        if type == .voIP {
            if let data = payload.dictionaryPayload["aps"] as? [String: Any],
               let type = payload.dictionaryPayload["type"] as? String,
               type == "incoming_call" {
                
                let callerName = payload.dictionaryPayload["caller_name"] as? String ?? "Someone"
                let handle = payload.dictionaryPayload["caller_id"] as? String ?? "NoteStandard"
                let uuid = UUID() // Standard pattern: generate fresh UUID for native UI
                
                let update = CXCallUpdate()
                update.remoteHandle = CXHandle(type: .generic, value: handle)
                update.localizedCallerName = callerName
                update.hasVideo = (payload.dictionaryPayload["call_type"] as? String == "video")

                provider?.reportNewIncomingCall(with: uuid, update: update) { error in
                    if let error = error {
                        print("[VoIP] ❌ Error reporting incoming call: \(error.localizedDescription)")
                    } else {
                        print("[VoIP] ✅ Incoming call reported to CallKit")
                    }
                    completion()
                }
            } else {
                completion()
            }
        } else {
            completion()
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        // Handle token invalidation
    }
    
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        // Handle token update - this is where you get the VoIP token
        let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()
        print("[VoIP] 🔑 VoIP Token Updated: \(token)")
        // You should send this token to your backend
    }
}
