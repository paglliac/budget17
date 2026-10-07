import SwiftUI

/// What is set up once in a while, switched on the band: regular expenses, incomes and categories. The server is
/// behind the gear.
struct MoreView: View {
    enum Part: Hashable { case regular, income, categories }

    @State private var part = Part.regular
    @State private var showServer = false

    var body: some View {
        Group {
            switch part {
            case .regular: RegularPanel(frame: frame)
            case .income: IncomePanel(frame: frame)
            case .categories: CategoriesPanel(frame: frame)
            }
        }
        .sheet(isPresented: $showServer) { ServerSheet() }
    }

    private var frame: MoreFrame { MoreFrame(part: $part, showServer: $showServer) }
}

/// The header and band every part of «Ещё» shares.
struct MoreFrame {
    @Binding var part: MoreView.Part
    @Binding var showServer: Bool

    var header: some View {
        TopHeader {
            Text("Ещё").font(.title2.weight(.bold))
        } trailing: {
            HeaderButton(systemImage: "gearshape", label: "Сервер") { showServer = true }
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

/// Where the server is, when it last synced, and the way out.
struct ServerSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            Form {
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
                }
                Section {
                    Button("Выйти", role: .destructive) { confirmSignOut = true }
                }
            }
            .navigationTitle("Сервер")
            .inlineTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .confirmationDialog("Выйти из приложения?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Выйти", role: .destructive) { session.signOut() }
            } message: {
                Text("Данные останутся на сервере. Чтобы войти снова, понадобится токен доступа.")
            }
        }
        .presentationDetents([.medium])
    }
}
