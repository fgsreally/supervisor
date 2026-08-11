import ActivityKit
import Foundation
import Capacitor

@available(iOS 16.1, *)
struct SupervisorLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var subtitle: String
        var phase: String
    }

    var sessionId: String
    var title: String
}

@available(iOS 16.1, *)
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private var activities: [String: Activity<SupervisorLiveActivityAttributes>] = [:]

    func start(from call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let sessionId = call.getString("sessionId") ?? UUID().uuidString
        let title = call.getString("title") ?? "Supervisor"
        let subtitle = call.getString("subtitle") ?? ""
        let phase = call.getString("phase") ?? "thinking"
        let attributes = SupervisorLiveActivityAttributes(sessionId: sessionId, title: title)
        let state = SupervisorLiveActivityAttributes.ContentState(subtitle: subtitle, phase: phase)
        do {
            if let existing = activities[sessionId] {
                Task { await existing.update(ActivityContent(state: state, staleDate: nil)) }
                return
            }
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            activities[sessionId] = activity
        } catch {
            NSLog("LiveActivity start failed: \(error.localizedDescription)")
        }
    }

    func update(from call: CAPPluginCall) {
        let sessionId = call.getString("sessionId") ?? ""
        guard let activity = activities[sessionId] else {
            start(from: call)
            return
        }
        let subtitle = call.getString("subtitle") ?? ""
        let phase = call.getString("phase") ?? "thinking"
        let state = SupervisorLiveActivityAttributes.ContentState(subtitle: subtitle, phase: phase)
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    func end(sessionId: String?) {
        if sessionId == nil || sessionId == "aggregate" {
            let ending = activities
            activities.removeAll()
            for (_, activity) in ending {
                Task { await activity.end(nil, dismissalPolicy: .immediate) }
            }
            return
        }
        guard let sessionId, let activity = activities.removeValue(forKey: sessionId) else { return }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
