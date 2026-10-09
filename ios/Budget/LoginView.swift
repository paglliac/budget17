import SwiftUI

/// The first screen, until a server is set.
struct LoginView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Бюджет").font(.system(size: 40, weight: .bold)).padding(.top, 40)
                ServerForm(action: "Войти")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(LilacBackground())
    }
}

/// Where the server is and its access token; both are checked against the server before they are kept, so a wrong
/// address leaves the server the app had. Signs in, and switches to another server from the server's panel.
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
        LilacTextField(label: "Сервер", text: $address, placeholder: "budget.example.ru", keyboard: .url)
        LilacTextField(label: "Токен доступа", text: $token, placeholder: "Токен", keyboard: .secret)
        Text(verbatim: "Адрес сервера бюджета и токен из ACCESS_TOKEN в его .env. Для сервера на Mac в домашней сети — http://имя-мака.local:4317, токен не нужен.")
            .font(.footnote)
            .foregroundStyle(Lilac.muted)
            .padding(.top, 10)
        if let message = error ?? session.notice {
            Text(message).font(.subheadline).foregroundStyle(Lilac.red).padding(.top, 12)
        }
        LilacPrimaryButton(label: checking ? "Проверяю…" : action, busy: checking || address.isEmpty) {
            Task { await signIn() }
        }
        .padding(.top, 24)
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
