import Foundation

/// What went wrong with a request, in words for the screen.
enum APIError: LocalizedError {
    /// The server wants the access token, or another one.
    case unauthorized
    /// The form has mistakes, by field, as the server words them.
    case invalid([String: String])
    case server(String)
    /// The server does not answer, or the proxy in front of it says it is down; screens then show what they saved.
    case unreachable(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Сервер не принял токен доступа."
        case .invalid(let errors): errors.values.sorted().joined(separator: "\n")
        case .server(let message), .unreachable(let message): message
        }
    }
}

/// The server's JSON API: screens are read by GET, and changes post the same forms as the web pages do.
struct APIClient {
    let base: URL
    /// Empty for a server without ACCESS_TOKEN, such as the one on the Mac.
    let token: String

    func get<T: Decodable>(_ path: String, _ query: [String: String?] = [:]) async throws -> T {
        try JSONDecoder().decode(T.self, from: await data(path, query))
    }

    /// A screen's JSON as the server sent it, to be read and kept. A server that does not answer in 15 seconds counts
    /// as gone, so the app turns to what it saved.
    func data(_ path: String, _ query: [String: String?] = [:]) async throws -> Data {
        var components = URLComponents(url: url(path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { name, value in value.map { URLQueryItem(name: name, value: $0) } }
        if !items.isEmpty { components.queryItems = items.sorted { $0.name < $1.name } }
        return try await load(request(components.url!, timeout: 15))
    }

    /// Posts a form; throws `.invalid` with what to fix when the server turns it down.
    func post(_ path: String, _ form: [String: String] = [:]) async throws {
        var request = request(url(path))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(form.map { "\(Self.encode($0))=\(Self.encode($1))" }.sorted().joined(separator: "&").utf8)
        _ = try await load(request)
    }

    private func load(_ request: URLRequest) async throws -> Data {
        let data: Data, response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch let error as URLError where error.code != .cancelled {
            throw APIError.unreachable(error.localizedDescription)
        }
        try check(data, response)
        return data
    }

    private func url(_ path: String) -> URL {
        base.appending(path: "api").appending(path: path)
    }

    /// Posts wait longer: a sync waits for ZenMoney.
    private func request(_ url: URL, timeout: TimeInterval = 30) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: timeout)
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
        if [502, 503, 504].contains(http.statusCode) { throw APIError.unreachable("Сервер не отвечает (ошибка \(http.statusCode)).") }
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
