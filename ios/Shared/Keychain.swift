import Foundation
import Security

/// The server's address and its access token, kept in the Keychain group the app shares with its widget, so the widget
/// reads the server without signing in. The token opens all the data, so it never goes to plain settings.
enum Keychain {
    static let token = "budget.access-token"
    static let server = "budget.server"

    static func read(_ service: String) -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Saves a value, or deletes it when empty.
    static func save(_ value: String, _ service: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        SecItemDelete(query as CFDictionary)
        guard !value.isEmpty else { return }
        var item = query
        item[kSecValueData as String] = Data(value.utf8)
        // After the first unlock, so the widget can read it while the phone is locked.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(item as CFDictionary, nil)
    }
}
