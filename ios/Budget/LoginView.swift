import SwiftUI

/// The first screen, until a server is set.
struct LoginView: View {
    var body: some View {
        NavigationStack {
            ServerForm(action: "Войти")
                .navigationTitle("Бюджет")
        }
    }
}

/// Where the server is and its access token; both are checked against the server before they are kept, so a wrong
/// address leaves the server the app had. Signs in, and switches to another server from the server sheet.
struct ServerForm: View {
    let action: String
    /// After the new server is kept.
    let done: () -> Void

    @Environment(Session.self) private var session
    @State private var address: String
    @State private var token: String
    @State private var checking = false
    @State private var error: String?

    /// Starts with the server the app has, if any.
    init(action: String, address: String = "", token: String = "", done: @escaping () -> Void = {}) {
        self.action = action
        self.done = done
        _address = State(initialValue: address)
        _token = State(initialValue: token)
    }

    var body: some View {
        Form {
            Section {
                TextField("budget.example.ru", text: $address)
                    .urlKeyboard()
                    .textContentType(.URL)
                SecureField("Токен доступа", text: $token)
                    .plainInput()
            } header: {
                Text("Сервер")
            } footer: {
                Text(verbatim: "Адрес сервера бюджета и токен из ACCESS_TOKEN в его .env. Для сервера на Mac в домашней сети — http://имя-мака.local:4317, токен не нужен.")
            }
            if let message = error ?? session.notice {
                Section { Text(message).foregroundStyle(Palette.color("red")) }
            }
            Section {
                Button {
                    Task { await signIn() }
                } label: {
                    HStack {
                        Text(action)
                        if checking { Spacer(); ProgressView() }
                    }
                }
                .disabled(address.isEmpty || checking)
            }
        }
    }

    private func signIn() async {
        checking = true
        defer { checking = false }
        do {
            try await session.signIn(address: address, token: token)
            done()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
