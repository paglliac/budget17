import SwiftUI

/// Where the server is and its access token; both are checked against the server before they are kept.
struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var address = ""
    @State private var token = ""
    @State private var checking = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
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
                            Text("Войти")
                            if checking { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(address.isEmpty || checking)
                }
            }
            .navigationTitle("Бюджет")
        }
    }

    private func signIn() async {
        checking = true
        defer { checking = false }
        do {
            try await session.signIn(address: address, token: token)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
