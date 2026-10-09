import SwiftUI

/// What is set up once in a while, switched under the title: regular expenses, incomes and categories. The budget's
/// setup and the server are behind the gear.
struct MoreView: View {
    enum Part: Hashable { case regular, income, categories }

    @State private var part = Part.regular
    @State private var showSettings = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                LilacTitle(text: "Ещё") {
                    LilacIconButton(systemImage: "gearshape", label: "Настройки") { showSettings = true }
                }
                LilacSegmented(
                    items: [Segment(value: Part.regular, label: "Регулярные"), Segment(value: .income, label: "Доходы"), Segment(value: .categories, label: "Категории")],
                    selection: $part,
                    width: nil
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 4)
            Group {
                switch part {
                case .regular: RegularPanel()
                case .income: IncomePanel()
                case .categories: CategoriesPanel()
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .background(LilacBackground())
        .sheet(isPresented: $showSettings) { SettingsSheet() }
    }
}

/// A part of «Ещё»: its rows scrolling under the title and the switch.
struct MorePage<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }
}

/// The server alone, as it opens from any screen when the server cannot be reached.
struct ServerSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LilacForm(title: "Сервер") {
            ServerPanel { dismiss() }.padding(.top, 16)
        }
        .presentationDetents([.medium, .large])
        .accessibilityIdentifier("server-sheet")
    }
}

/// Where the server is, when it last synced, another server instead of it, and the way out.
struct ServerPanel: View {
    /// Called once another server is kept, to close what shows them.
    let switched: () -> Void
    @Environment(Session.self) private var session
    @State private var confirmSignOut = false
    @State private var switching = false

    var body: some View {
        LilacPanel {
            LilacPanelLine(title: "Адрес", first: true) {
                Text(session.server?.absoluteString ?? "").foregroundStyle(Lilac.muted).lineLimit(1).truncationMode(.middle)
            }
            if let syncedAt = session.syncedAt {
                LilacPanelLine(title: "Обновлено") { Text(syncedAt.formatted(.relative(presentation: .named))).foregroundStyle(Lilac.muted) }
            }
            Button {
                Task { await session.sync() }
            } label: {
                LilacPanelLine(title: "Обновить из ZenMoney", titleColor: Lilac.accent) {
                    if session.isSyncing { ProgressView() }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(session.isSyncing)
            Button { switching = true } label: {
                LilacPanelLine(title: "Сменить сервер", titleColor: Lilac.accent) {
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Lilac.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        LilacPanel {
            Button { confirmSignOut = true } label: {
                LilacPanelLine(title: "Выйти", first: true, titleColor: Lilac.red) { EmptyView() }.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 12)
        .confirmationDialog("Выйти из приложения?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) { session.signOut() }
        } message: {
            Text("Данные останутся на сервере, а сохранённые на телефоне удалятся. Чтобы войти снова, понадобится токен доступа.")
        }
        .sheet(isPresented: $switching) {
            LilacForm(title: "Другой сервер") {
                ServerForm(action: "Подключить", address: session.server?.absoluteString ?? "", token: session.token) {
                    switching = false
                    switched()
                }
            }
        }
    }
}
