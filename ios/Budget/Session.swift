import Foundation
import Observation
import WidgetKit

/// The server the app works with and what all screens share: every change bumps `version`, so screens on view load
/// again with it, and syncing with ZenMoney does the same.
@Observable
final class Session {
    private(set) var server: URL?
    private(set) var token: String
    /// Bumped by every change and sync; screens reload when it moves.
    private(set) var version = 0
    private(set) var syncedAt: Date?
    private(set) var isSyncing = false
    /// Expenses of this month without a category, for the badge of their tab.
    private(set) var pending = 0
    /// Why the app signed out by itself, for the login screen.
    private(set) var notice: String?

    private static let serverKey = "server"

    /// The server is kept as text, so a launch argument can set it too: -server http://localhost:4318. The widget reads
    /// it from the Keychain, where the token is.
    init() {
        server = UserDefaults.standard.string(forKey: Self.serverKey).flatMap(Self.url(from:))
        token = Keychain.read(Keychain.token)
        if let server, Keychain.read(Keychain.server) != server.absoluteString { Keychain.save(server.absoluteString, Keychain.server) }
    }

    var client: APIClient? { server.map { APIClient(base: $0, token: token) } }

    /// Checks the server and the token before keeping them.
    func signIn(address: String, token: String) async throws {
        guard let url = Self.url(from: address) else { throw APIError.server("Не похоже на адрес сервера.") }
        let client = APIClient(base: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines))
        let _: SessionInfo = try await client.get("session")
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        Keychain.save(url.absoluteString, Keychain.server)
        Keychain.save(client.token, Keychain.token)
        server = url
        self.token = client.token
        notice = nil
        changed()
    }

    func signOut(notice: String? = nil) {
        UserDefaults.standard.removeObject(forKey: Self.serverKey)
        Keychain.save("", Keychain.server)
        Keychain.save("", Keychain.token)
        server = nil
        token = ""
        self.notice = notice
    }

    func get<T: Decodable>(_ path: String, _ query: [String: String?] = [:]) async throws -> T {
        guard let client else { throw APIError.unauthorized }
        do {
            return try await client.get(path, query)
        } catch APIError.unauthorized {
            signOut(notice: "Сервер больше не принимает токен. Войдите заново.")
            throw APIError.unauthorized
        }
    }

    /// Posts a form to the server; on success every screen loads again.
    func send(_ path: String, _ form: [String: String] = [:]) async throws {
        guard let client else { throw APIError.unauthorized }
        do {
            try await client.post(path, form)
            changed()
        } catch APIError.unauthorized {
            signOut(notice: "Сервер больше не принимает токен. Войдите заново.")
            throw APIError.unauthorized
        }
    }

    /// Asks the server to fetch what ZenMoney has new; quietly keeps the old data when it cannot.
    func sync() async {
        guard let client, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        do {
            try await client.post("sync")
            syncedAt = Date()
            changed()
        } catch {
            // The screens show what the server has; a failed sync is not worth an alert.
        }
    }

    /// Every screen loads again, and so does the widget.
    private func changed() {
        version += 1
        WidgetCenter.shared.reloadAllTimelines()
    }

    func refreshPending() async {
        guard let screen: UncategorizedScreen = try? await get("uncategorized") else { return }
        pending = screen.pending.reduce(0) { $0 + $1.items.count }
    }

    /// A typed address with https:// added when the scheme is left out.
    static func url(from address: String) -> URL? {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "https://\(text)" }
        guard let url = URL(string: text), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host() != nil else { return nil }
        return url
    }
}
