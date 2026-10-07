import SwiftUI

/// Regular expenses in the order of the month: what is behind, quieter, a line at today, what is ahead, and those that
/// start later, each by the date of its payment; on top, what is left to pay this month.
struct RegularPanel: View {
    let frame: MoreFrame
    @State private var editing: RegularItem?
    @State private var adding = false

    var body: some View {
        Screen(path: "regular") { (s: RegularScreen) in
            SplitScreen {
                frame.header
            } summary: {
                VStack(alignment: .leading, spacing: 10) {
                    SummaryLabel(s.total.label)
                    BigAmount(amount: s.total.amount, symbol: s.symbol)
                    Text(s.total.note).font(.footnote).foregroundStyle(Ink.muted)
                    if let parts = s.total.parts, !parts.isEmpty { SummaryBar(parts: parts, total: s.total.amount) }
                }
            } band: {
                frame.band
            } content: {
                ForEach(s.behind) { item in card(item, s.symbol) }
                if !s.behind.isEmpty && !s.ahead.isEmpty { TodayLine(text: s.today) }
                ForEach(s.ahead) { item in card(item, s.symbol) }
                if !s.later.isEmpty {
                    SheetLabel(text: "Начнутся позже")
                    ForEach(s.later) { item in card(item, s.symbol) }
                }
                AddCard(label: "Добавить регулярную трату") { adding = true }
            }
            .sheet(item: $editing) { item in RegularSheet(item: item, icons: s.icons, symbol: s.symbol) }
            .sheet(isPresented: $adding) { RegularSheet(item: nil, icons: s.icons, symbol: s.symbol) }
        }
    }

    private func card(_ item: RegularItem, _ symbol: String) -> some View {
        Button { editing = item } label: { Card(row: item.row, symbol: symbol) }
            .buttonStyle(.plain)
    }
}

/// A regular expense to add or change: name, amount and day, and the dates and icon folded under them.
struct RegularSheet: View {
    let item: RegularItem?
    let icons: [IconChoice]
    let symbol: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var day = ""
    @State private var hasStart = false
    @State private var start = Date()
    @State private var hasEnd = false
    @State private var end = Date()
    @State private var icon = ""
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Например, аренда", text: $title)
                    FieldError(text: errors["title"])
                    TextField("Сумма, \(symbol)", text: $amount).decimalKeyboard()
                    FieldError(text: errors["amount"])
                    TextField("Число месяца", text: $day).numberKeyboard()
                    FieldError(text: errors["day"])
                } footer: {
                    Text("Если числа нет в месяце, например 31-го, платёж приходится на последний день.")
                }
                Section {
                    Toggle("Дата начала", isOn: $hasStart)
                    if hasStart { DatePicker("С", selection: $start, displayedComponents: .date) }
                    FieldError(text: errors["start"])
                    Toggle("Дата окончания", isOn: $hasEnd)
                    if hasEnd { DatePicker("По", selection: $end, displayedComponents: .date) }
                    FieldError(text: errors["end"])
                }
                Section("Иконка") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 52))], spacing: 12) {
                        iconButton(name: "", symbolName: "textformat", label: "По названию")
                        ForEach(icons, id: \.icon) { choice in
                            iconButton(name: choice.icon, symbolName: Icons.symbol(choice.icon), label: choice.label)
                        }
                    }
                    .padding(.vertical, 6)
                }
                if item != nil {
                    Section { Button("Удалить", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(item == nil ? "Новая регулярная трата" : "Регулярная трата")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(item == nil ? "Добавить" : "Сохранить") { save() }.disabled(busy)
                }
            }
            .confirmationDialog("Удалить регулярную трату?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { submit("regular/\(item!.expense.id)/delete", [:]) }
            } message: {
                Text("Траты, привязанные к ней, останутся без привязки.")
            }
            .errorAlert($error)
            .onAppear(perform: fill)
        }
    }

    private func iconButton(name: String, symbolName: String, label: String) -> some View {
        Button { icon = name } label: {
            Image(systemName: symbolName)
                .font(.title3)
                .frame(width: 44, height: 44)
                .background(icon == name ? Color.accentColor.opacity(0.18) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(icon == name ? Color.accentColor : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.borderless)
        .tint(.primary)
        .accessibilityLabel(label)
    }

    private func fill() {
        guard let values = item?.values else { return }
        title = values["title"] ?? ""
        amount = values["amount"] ?? ""
        day = values["day"] ?? ""
        icon = values["icon"] ?? ""
        if let text = values["start"], let date = Dates.date(text) {
            hasStart = true
            start = date
        }
        if let text = values["end"], let date = Dates.date(text) {
            hasEnd = true
            end = date
        }
    }

    private func save() {
        let form = [
            "title": title, "amount": amount, "day": day, "icon": icon,
            "start": hasStart ? Dates.text(start) : "", "end": hasEnd ? Dates.text(end) : "",
        ]
        submit(item.map { "regular/\($0.expense.id)" } ?? "regular", form)
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
