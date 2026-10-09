import SwiftUI

/// Incomes with what they bring a month, and the payments of the coming weeks by date with how each is worked out.
struct IncomePanel: View {
    @State private var editing: IncomeItem?
    @State private var adding = false

    var body: some View {
        Screen(path: "income") { (s: IncomeScreen) in
            MorePage {
                LilacSummary(label: s.total.label, amount: s.total.amount, symbol: s.symbol, note: s.total.note)
                ForEach(Array(s.incomes.enumerated()), id: \.element.id) { index, item in
                    Button { editing = item } label: {
                        LilacRow(marker: .icon(item.row), title: item.row.title, details: item.row.details, amount: item.row.amount, symbol: s.symbol,
                                 first: index == 0)
                    }
                    .buttonStyle(.card)
                }
                .padding(.top, 10)
                LilacAddRow(label: "Добавить доход") { adding = true }
                if !s.upcoming.isEmpty { LilacHeading("Ближайшие поступления") }
                ForEach(s.upcoming, id: \.date) { day in
                    LilacDayHeading(title: day.title, subtitle: day.subtitle)
                    ForEach(Array(day.items.enumerated()), id: \.element.id) { index, payment in
                        LilacRow(marker: .icon(payment.row), title: payment.row.title, details: payment.row.details, amount: payment.row.amount,
                                 symbol: s.symbol, first: index == 0, chevron: false, signed: true, amountColor: Palette.color("green")) {
                            if let formula = payment.formula {
                                Text(formula).font(.caption).foregroundStyle(Lilac.muted)
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
    @State private var confirmDelete = false
    @State private var sender = FormSender()

    var body: some View {
        LilacForm(
            title: item == nil ? "Новый доход" : "Доход",
            destructive: item == nil ? nil : (label: "Удалить", action: { confirmDelete = true }),
            primary: item == nil ? "Добавить" : "Сохранить",
            busy: sender.busy,
            save: save
        ) {
            if item == nil {
                LilacFieldLabel(text: "Как приходят деньги")
                LilacSegmented(items: models.map { Segment(value: $0.id, label: $0.title) }, selection: $model, width: nil)
                    .onChange(of: model) { _, id in
                        if let picked = models.first(where: { $0.id == id }) { values = picked.defaults.merging(["title": values["title"] ?? ""]) { $1 } }
                    }
            }
            LilacTextField(label: "Название", text: binding("title"), placeholder: "Например, сдача квартиры", error: sender.errors["title"])
            ForEach(current?.fields ?? [], id: \.name) { field in
                LilacTextField(
                    label: field.kind == "amount" ? "\(field.label), \(symbol)" : field.label,
                    text: binding(field.name),
                    placeholder: field.placeholder ?? "",
                    error: sender.errors[field.name],
                    keyboard: field.kind == "amount" ? .decimal : .number
                )
            }
        }
        .confirmationDialog("Удалить доход?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { sender.send(session, "income/\(item!.income.id)/delete", [:]) { dismiss() } }
        }
        .errorAlert($sender.error)
        .onAppear {
            model = item?.income.model ?? models.first?.id ?? ""
            values = item?.values ?? (models.first?.defaults ?? [:])
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
        sender.send(session, item.map { "income/\($0.income.id)" } ?? "income", form) { dismiss() }
    }
}
