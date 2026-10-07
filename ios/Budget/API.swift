import Foundation

/// What went wrong with a request, in words for the screen.
enum APIError: LocalizedError {
    /// The server wants the access token, or another one.
    case unauthorized
    /// The form has mistakes, by field, as the server words them.
    case invalid([String: String])
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Сервер не принял токен доступа."
        case .invalid(let errors): errors.values.sorted().joined(separator: "\n")
        case .server(let message): message
        }
    }
}

/// The server's JSON API: screens are read by GET, and changes post the same forms as the web pages do.
struct APIClient {
    let base: URL
    /// Empty for a server without ACCESS_TOKEN, such as the one on the Mac.
    let token: String

    func get<T: Decodable>(_ path: String, _ query: [String: String?] = [:]) async throws -> T {
        var components = URLComponents(url: url(path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { name, value in value.map { URLQueryItem(name: name, value: $0) } }
        if !items.isEmpty { components.queryItems = items.sorted { $0.name < $1.name } }
        let (data, response) = try await URLSession.shared.data(for: request(components.url!))
        try check(data, response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Posts a form; throws `.invalid` with what to fix when the server turns it down.
    func post(_ path: String, _ form: [String: String] = [:]) async throws {
        var request = request(url(path))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(form.map { "\(Self.encode($0))=\(Self.encode($1))" }.sorted().joined(separator: "&").utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        try check(data, response)
    }

    private func url(_ path: String) -> URL {
        base.appending(path: "api").appending(path: path)
    }

    private func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: 30)
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private struct Failure: Decodable {
        let error: String?
        let errors: [String: String]?
    }

    private func check(_ data: Data, _ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.server("Сервер не ответил.") }
        if (200..<300).contains(http.statusCode) { return }
        if http.statusCode == 401 { throw APIError.unauthorized }
        let failure = try? JSONDecoder().decode(Failure.self, from: data)
        if let errors = failure?.errors { throw APIError.invalid(errors) }
        throw APIError.server(failure?.error ?? "Сервер ответил ошибкой \(http.statusCode).")
    }

    /// Percent-encodes a form value; `+` and `&` must not pass as they are.
    private static func encode(_ text: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? text
    }
}
