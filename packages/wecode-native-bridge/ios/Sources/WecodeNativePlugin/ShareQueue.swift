import Foundation
import UniformTypeIdentifiers

public final class ShareQueue {
    public struct Item {
        public let uri: String
        public let mimeType: String
        public let name: String
    }

    private static var pending: [Item] = []
    private static let lock = NSLock()

    private init() {}

    public static func enqueue(_ items: [Item]) {
        guard !items.isEmpty else { return }
        lock.lock()
        pending.append(contentsOf: items)
        lock.unlock()
    }

    public static func toJSObject() -> [String: Any]? {
        lock.lock()
        defer { lock.unlock() }
        if pending.isEmpty { return nil }
        let items: [[String: String]] = pending.map {
            ["uri": $0.uri, "mimeType": $0.mimeType, "name": $0.name]
        }
        return ["items": items]
    }

    public static func clear() {
        lock.lock()
        pending.removeAll()
        lock.unlock()
    }

    public static func copyToCache(_ urls: [URL]) -> [Item] {
        let fm = FileManager.default
        guard let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return []
        }
        let dir = caches.appendingPathComponent("share", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)

        var items: [Item] = []
        for url in urls {
            let accessed = url.startAccessingSecurityScopedResource()
            defer {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
            let name = sanitizedName(url.lastPathComponent)
            let dest = dir.appendingPathComponent("\(UUID().uuidString)-\(name)")
            do {
                if fm.fileExists(atPath: dest.path) {
                    try fm.removeItem(at: dest)
                }
                try fm.copyItem(at: url, to: dest)
                items.append(Item(uri: dest.path, mimeType: mimeType(for: url), name: name))
            } catch {
                continue
            }
        }
        return items
    }

    private static func sanitizedName(_ raw: String) -> String {
        let trimmed = raw.replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
        return trimmed.isEmpty ? "shared.bin" : trimmed
    }

    private static func mimeType(for url: URL) -> String {
        if let type = UTType(filenameExtension: url.pathExtension),
           let mime = type.preferredMIMEType
        {
            return mime
        }
        return "application/octet-stream"
    }
}
