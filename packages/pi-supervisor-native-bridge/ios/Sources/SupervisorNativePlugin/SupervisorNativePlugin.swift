import Foundation
import Capacitor

@objc(SupervisorNativePlugin)
public class SupervisorNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SupervisorNativePlugin"
    public let jsName = "SupervisorNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAndroidLiveUpdatesAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isOppoLiveUpdatesAvailable", returnType: CAPPluginReturnPromise),
    ]

    @objc func getPushToken(_ call: CAPPluginCall) {
        call.resolve([
            "token": NSNull(),
            "platform": "ios",
        ])
    }

    @objc func getPendingShare(_ call: CAPPluginCall) {
        call.resolve(NSNull())
    }

    @objc func clearPendingShare(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func startBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func stopBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func updateBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func startLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.start(from: call)
        }
        call.resolve()
    }

    @objc func updateLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.update(from: call)
        }
        call.resolve()
    }

    @objc func endLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.end(sessionId: call.getString("sessionId"))
        }
        call.resolve()
    }

    @objc func isAndroidLiveUpdatesAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": false,
            "promoted": false,
            "reason": "ios",
        ])
    }

    @objc func isOppoLiveUpdatesAvailable(_ call: CAPPluginCall) {
        isAndroidLiveUpdatesAvailable(call)
    }
}
