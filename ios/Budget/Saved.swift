import CryptoKit
import Foundation

/// The server's last answer for every screen, kept on the phone: the app shows it at once and goes on showing it while
/// the server cannot be reached. A screen is its path with its query, one file each, dated by when it was saved.
struct Saved {
    /// A copy left unread this long before the newest one goes away, such as a week looked at once.
    static let keep: TimeInterval = 60 * 24 * 60 * 60

    let folder: URL

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        folder = support.appending(path: "Saved", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        prune()
    }

    func read(_ path: String, _ query: [String: String?]) -> (data: Data, date: Date)? {
        let file = file(path, query)
        guard let data = try? Data(contentsOf: file) else { return nil }
        let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
        return (data, date)
    }

    func write(_ data: Data, _ path: String, _ query: [String: String?]) {
        try? data.write(to: file(path, query), options: .atomic)
    }

    /// Forgets everything, as when signing out.
    func clear() {
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    /// Counted from the newest copy rather than from today, so a server gone for long does not empty the app.
    private func prune() {
        let key = URLResourceKey.contentModificationDateKey
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [key])) ?? []
        let dated = files.compactMap { file in (try? file.resourceValues(forKeys: [key]))?.contentModificationDate.map { (file, $0) } }
        guard let newest = dated.map(\.1).max() else { return }
        for (file, date) in dated where date < newest.addingTimeInterval(-Self.keep) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    /// Paths carry ids and queries carry searched text, so the name is a hash of them.
    private func file(_ path: String, _ query: [String: String?]) -> URL {
        let items = query.compactMap { name, value in value.map { "\(name)=\($0)" } }.sorted()
        let key = ([path] + items).joined(separator: "&")
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appending(path: "\(name).json")
    }
}
