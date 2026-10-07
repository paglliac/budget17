import SwiftUI

/// Incomes with what they bring a month, and the payments of the coming weeks by date with how each is worked out.
struct IncomePanel: View {
    let frame: MoreFrame
    @State private var editing: IncomeItem?
    @State private var adding = false

    var body: some View {
        Screen(path: "income") { (s: IncomeScreen) in
            SplitScreen {
                frame.header
            } summary: {
                VStack(alignment: .leading, spacing: 10) {
                    SummaryLabel(s.total.label)
                    BigAmount(amount: s.total.amount, symbol: s.symbol)
                    Text(s.total.note).font(.footnote).foregroundStyle(Ink.muted)
                }
            } band: {
                frame.band
            } content: {
                ForEach(s.incomes) { item in
                    Button { editing = item } label: { Card(row: item.row, symbol: s.symbol) }
                        .buttonStyle(.card)
                }
                AddCard(label: "Добавить доход") { adding = true }
                if !s.upcoming.isEmpty { SheetLabel(text: "Ближайшие поступления") }
                ForEach(s.upcoming, id: \.date) { day in
                    DayHeading(title: day.title, subtitle: day.subtitle)
                    ForEach(day.items) { payment in
                        Card(row: payment.row, symbol: s.symbol, signed: true, amountColor: Palette.color("green")) {
                            if let formula = payment.formula {
                                Text(formula).font(.caption).foregroundStyle(Ink.muted)
                            }
                        }
                    }
                }
            }
            .sheet(item: $editing) { item in IncomeSheet(item: item, models: s.models, symbol: s.symbol) }
            .sheet(isPresented: $adding) { IncomeSheet(item: nil, models: s.models, symbol: s.symbol) }
        }
    }
}

/// An income to add, following one of the models, or one to change; the fields come from its model.
struct IncomeSheet: View {
    let item: IncomeItem?
    let models: [IncomeModel]
    let symbol: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var model = ""
    @State private var values: [String: String] = [:]
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if item == nil {
                    Section("Как приходят деньги") {
                        Picker("Модель", selection: $model) {
                            ForEach(models) { Text($0.title).tag($0.id) }
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: model) { _, id in
                            if let picked = models.first(where: { $0.id == id }) { values = picked.defaults.merging(["title": values["title"] ?? ""]) { $1 } }
                        }
                    }
                }
                Section {
                    TextField("Например, сдача квартиры", text: binding("title"))
                    FieldError(text: errors["title"])
                    ForEach(current?.fields ?? [], id: \.name) { field in
                        LabeledContent(field.kind == "amount" ? "\(field.label), \(symbol)" : field.label) {
                            TextField(field.placeholder ?? "", text: binding(field.name))
                                .multilineTextAlignment(.trailing)
                                .modifier(NumberField(kind: field.kind))
                        }
                        FieldError(text: errors[field.name])
                    }
                }
                if item != nil {
                    Section { Button("Удалить", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(item == nil ? "Новый доход" : "Доход")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(item == nil ? "Добавить" : "Сохранить") { save() }.disabled(busy)
                }
            }
            .confirmationDialog("Удалить доход?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { submit("income/\(item!.income.id)/delete", [:]) }
            }
            .errorAlert($error)
            .onAppear {
                model = item?.income.model ?? models.first?.id ?? ""
                values = item?.values ?? (models.first?.defaults ?? [:])
            }
        }
    }

    private var current: IncomeModel? { models.first { $0.id == model } }

    private func binding(_ name: String) -> Binding<String> {
        Binding(get: { values[name] ?? "" }, set: { values[name] = $0 })
    }

    private func save() {
        var form = ["title": values["title"] ?? ""]
        for field in current?.fields ?? [] { form[field.name] = values[field.name] ?? "" }
        if item == nil { form["model"] = model }
        submit(item.map { "income/\($0.income.id)" } ?? "income", form)
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

private struct NumberField: ViewModifier {
    let kind: String

    func body(content: Content) -> some View {
        if kind == "amount" { content.decimalKeyboard() } else { content.numberKeyboard() }
    }
}
