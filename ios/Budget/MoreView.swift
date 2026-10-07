import SwiftUI

/// What is set up once in a while, switched on the band: regular expenses, incomes and categories. The budget's
/// setup and the server are behind the gear.
struct MoreView: View {
    enum Part: Hashable { case regular, income, categories }

    @State private var part = Part.regular
    @State private var showSettings = false

    var body: some View {
        Group {
            switch part {
            case .regular: RegularPanel(frame: frame)
            case .income: IncomePanel(frame: frame)
            case .categories: CategoriesPanel(frame: frame)
            }
        }
        .sheet(isPresented: $showSettings) { SettingsSheet() }
    }

    private var frame: MoreFrame { MoreFrame(part: $part, showSettings: $showSettings) }
}

/// The header and band every part of «Ещё» shares.
struct MoreFrame {
    @Binding var part: MoreView.Part
    @Binding var showSettings: Bool

    var header: some View {
        TopHeader {
            Text("Ещё").font(.title2.weight(.bold))
        } trailing: {
            HeaderButton(systemImage: "gearshape", label: "Настройки") { showSettings = true }
        }
    }

    var band: some View {
        BandSwitch(
            items: [
                BandItem(value: MoreView.Part.regular, label: "Регулярные"),
                BandItem(value: .income, label: "Доходы"),
                BandItem(value: .categories, label: "Категории"),
            ],
            selection: $part
        )
    }
}

/// The server alone, as it opens from any screen when the server cannot be reached.
struct ServerSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                ServerSections { dismiss() }
            }
            .navigationTitle("Сервер")
            .inlineTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Where the server is, when it last synced, another server instead of it, and the way out.
struct ServerSections: View {
    /// Called once another server is kept, to close what shows them.
    let switched: () -> Void
    var header: String?
    @Environment(Session.self) private var session
    @State private var confirmSignOut = false

    var body: some View {
        Section {
            LabeledContent("Адрес", value: session.server?.absoluteString ?? "")
            if let syncedAt = session.syncedAt {
                LabeledContent("Обновлено", value: syncedAt.formatted(.relative(presentation: .named)))
            }
            Button {
                Task { await session.sync() }
            } label: {
                HStack {
                    Text("Обновить из ZenMoney")
                    if session.isSyncing { Spacer(); ProgressView() }
                }
            }
            .disabled(session.isSyncing)
            NavigationLink("Сменить сервер") {
                ServerForm(action: "Подключить", address: session.server?.absoluteString ?? "", token: session.token, done: switched)
                    .navigationTitle("Другой сервер")
                    .inlineTitle()
            }
        } header: {
            if let header { Text(header) }
        }
        Section {
            Button("Выйти", role: .destructive) { confirmSignOut = true }
                .confirmationDialog("Выйти из приложения?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                    Button("Выйти", role: .destructive) { session.signOut() }
                } message: {
                    Text("Данные останутся на сервере, а сохранённые на телефоне удалятся. Чтобы войти снова, понадобится токен доступа.")
                }
        }
    }
}
