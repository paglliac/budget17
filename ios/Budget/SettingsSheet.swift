import SwiftUI

/// Behind the gear of «Ещё»: the day a week begins on, then the server. The day shows what the server sent last for it
/// at once, and is left out until the server has sent it once. The amount of one week is changed on the week itself.
struct SettingsSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var budget: BudgetSettingsScreen?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let budget { BudgetSection(screen: budget, error: $error) }
                ServerSections(switched: { dismiss() }, header: "Сервер")
            }
            .navigationTitle("Настройки")
            .inlineTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .errorAlert($error)
            .task(id: session.version) { await load() }
        }
    }

    private func load() async {
        if budget == nil { budget = session.saved("budget-settings")?.value }
        if let fresh: BudgetSettingsScreen = try? await session.get("budget-settings") { budget = fresh }
    }
}

/// The day a week begins on, picked from a list and saved at once, and the usual amount of a week.
struct BudgetSection: View {
    let screen: BudgetSettingsScreen
    @Binding var error: String?
    @Environment(Session.self) private var session
    /// The day just picked, shown at once while the server saves it.
    @State private var picked: Int?

    var body: some View {
        Section("Бюджет") {
            Picker("Неделя начинается", selection: Binding(get: { picked ?? screen.weekStart }, set: { pick($0) })) {
                ForEach(screen.weekdays, id: \.value) { day in Text(day.label).tag(day.value) }
            }
            LabeledContent("На неделю", value: Money.text(screen.limit, screen.symbol))
        }
        .onChange(of: screen.weekStart) { picked = nil }
    }

    private func pick(_ day: Int) {
        guard day != (picked ?? screen.weekStart) else { return }
        picked = day
        Task {
            do {
                try await session.send("budget/week-start/\(day)")
            } catch {
                picked = nil
                self.error = error.localizedDescription
            }
        }
    }
}
