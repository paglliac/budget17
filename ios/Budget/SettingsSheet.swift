import SwiftUI

/// Behind the gear of «Ещё»: the budget's setup, then the server. The budget shows what the server sent last for it
/// at once, and is left out until the server has sent it once.
struct SettingsSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var budget: BudgetSettingsScreen?
    @State private var editing: WeekLimitDraft?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let budget { BudgetSection(screen: budget, editing: $editing, error: $error) }
                ServerSections(switched: { dismiss() }, header: "Сервер")
            }
            .navigationTitle("Настройки")
            .inlineTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .sheet(item: $editing) { draft in WeekLimitSheet(draft: draft) }
            .errorAlert($error)
            .task(id: session.version) { await load() }
        }
    }

    private func load() async {
        if budget == nil { budget = session.saved("budget-settings")?.value }
        if let fresh: BudgetSettingsScreen = try? await session.get("budget-settings") { budget = fresh }
    }
}

/// The day a week begins on, the usual amount of a week and the weeks with an amount of their own, each opening to
/// change it.
struct BudgetSection: View {
    let screen: BudgetSettingsScreen
    @Binding var editing: WeekLimitDraft?
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
            ForEach(screen.weeks) { line in
                Button { editing = draft(line) } label: {
                    LabeledContent(line.row.title, value: Money.text(line.row.amount ?? screen.limit, screen.symbol))
                        .foregroundStyle(line.row.muted ? Color.secondary : Color.primary)
                }
                .accessibilityIdentifier(line.id)
            }
            Button("Изменить бюджет недели") { editing = draft(nil) }
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

    private func draft(_ line: WeekLine?) -> WeekLimitDraft {
        WeekLimitDraft(
            week: line?.week,
            title: line?.row.title ?? "Бюджет недели",
            amount: line?.row.amount,
            limit: screen.limit,
            symbol: screen.symbol,
            current: screen.current,
            choices: screen.weekChoices
        )
    }
}

/// A week's amount to set: of a week that has one, or of a week to pick.
struct WeekLimitDraft: Identifiable, Hashable {
    /// nil when the week is to be picked.
    let week: String?
    let title: String
    let amount: Double?
    /// The usual amount, which a week gets back.
    let limit: Double
    let symbol: String
    /// The first day of the current week, picked unless another is.
    let current: String
    let choices: [OptionGroup]
    var id: String { week ?? "new" }
}

struct WeekLimitSheet: View {
    let draft: WeekLimitDraft
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var week = ""
    @State private var amount = ""
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if draft.week == nil {
                        Picker("Неделя", selection: $week) {
                            ForEach(draft.choices, id: \.label) { group in
                                Section(group.label) {
                                    ForEach(group.options, id: \.value) { Text($0.label).tag($0.value) }
                                }
                            }
                        }
                        FieldError(text: errors["week"])
                    }
                    TextField("Сумма", text: $amount).decimalKeyboard()
                    FieldError(text: errors["amount"])
                }
                if let own = draft.week {
                    Section {
                        Button("Вернуть \(Money.text(draft.limit, draft.symbol))") { submit("budget/weeks/\(own)/delete", [:]) }
                    }
                }
            }
            .navigationTitle(draft.title)
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { submit(draft.week.map { "budget/weeks/\($0)" } ?? "budget/weeks", ["week": week, "amount": amount]) }
                        .disabled(busy)
                }
            }
            .presentationDetents([.medium])
            .errorAlert($error)
            .onAppear {
                week = draft.week ?? draft.current
                amount = draft.amount.map(Money.input) ?? ""
            }
        }
    }

    private func submit(_ path: String, _ form: [String: String]) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await session.send(path, form)
                dismiss()
            } catch APIError.invalid(let errors) {
                self.errors = errors
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
