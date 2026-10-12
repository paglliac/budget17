import SwiftUI

/// Behind the gear of «Ещё»: the day a week begins on and round figures, then the server. They show what the server sent
/// last at once, and are left out until the server has sent them once. The amount of one week is changed on the week
/// itself.
struct SettingsSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var budget: BudgetSettingsScreen?
    @State private var error: String?

    var body: some View {
        LilacForm(title: "Настройки") {
            if let budget { BudgetSection(screen: budget, error: $error) }
            LilacFieldLabel(text: "Сервер")
            ServerPanel { dismiss() }
        }
        .errorAlert($error)
        .task(id: session.version) { await load() }
        .accessibilityIdentifier("settings")
    }

    private func load() async {
        if budget == nil { budget = session.saved("budget-settings")?.value }
        if let fresh: BudgetSettingsScreen = try? await session.get("budget-settings") { budget = fresh }
    }
}

/// The day a week begins on, picked in one tap and saved at once, the usual amount of a week, and round figures on the
/// main page, switched the same way.
struct BudgetSection: View {
    let screen: BudgetSettingsScreen
    @Binding var error: String?
    @Environment(Session.self) private var session
    /// The day just picked, shown at once while the server saves it.
    @State private var picked: Int?
    /// Round figures just switched, shown at once while the server saves them.
    @State private var round: Bool?

    var body: some View {
        LilacFieldLabel(text: "Неделя начинается")
        LilacSegmented(
            items: screen.weekdays.map { Segment(value: $0.value, label: Dates.weekdaysShort[$0.value]) },
            selection: Binding(get: { picked ?? screen.weekStart }, set: { pick($0) }),
            width: nil
        )
        .onChange(of: screen.weekStart) { picked = nil }
        LilacPanel {
            LilacPanelLine(title: "На неделю", first: true) { Text(Money.text(screen.limit, screen.symbol)).foregroundStyle(Lilac.muted) }
            if let saved = screen.roundFigures {
                LilacPanelLine(title: "Круглые цифры") {
                    Toggle("Круглые цифры", isOn: Binding(get: { round ?? saved }, set: { switchRound($0) }))
                        .labelsHidden()
                        .tint(Lilac.accent)
                        .accessibilityIdentifier("round-figures")
                }
            }
        }
        .padding(.top, 12)
        .onChange(of: screen.roundFigures) { round = nil }
    }

    private func switchRound(_ on: Bool) {
        round = on
        Task {
            do {
                try await session.send("budget/round-figures/\(on ? "on" : "off")")
            } catch {
                round = nil
                self.error = error.localizedDescription
            }
        }
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
