import SwiftUI

/// Regular expenses in the order of the month: what is behind, quieter, a line at today, what is ahead, and those that
/// start later, each by the date of its payment; on top, what is left to pay this month with its bar.
struct RegularPanel: View {
    @State private var editing: RegularItem?
    @State private var adding = false

    var body: some View {
        Screen(path: "regular") { (s: RegularScreen) in
            MorePage {
                LilacSummary(label: s.total.label, amount: s.total.amount, symbol: s.symbol, note: s.total.note)
                if let parts = s.total.parts, !parts.isEmpty { LilacShareBar(parts: parts).padding(.top, 14) }
                rows(s.behind, s.symbol, first: true).padding(.top, 10)
                if !s.behind.isEmpty && !s.ahead.isEmpty { LilacTodayLine(text: s.today) }
                rows(s.ahead, s.symbol, first: s.behind.isEmpty)
                if !s.later.isEmpty {
                    LilacHeading("Начнутся позже")
                    rows(s.later, s.symbol, first: true)
                }
                LilacAddRow(label: "Добавить регулярную трату") { adding = true }
            }
            .sheet(item: $editing) { item in RegularSheet(item: item, icons: s.icons, symbol: s.symbol) }
            .sheet(isPresented: $adding) { RegularSheet(item: nil, icons: s.icons, symbol: s.symbol) }
        }
    }

    private func rows(_ items: [RegularItem], _ symbol: String, first: Bool) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            Button { editing = item } label: {
                LilacRow(marker: .icon(item.row), title: item.row.title, details: item.row.details, amount: item.row.amount, symbol: symbol,
                         muted: item.row.muted, first: first && index == 0)
            }
            .buttonStyle(.card)
        }
    }
}

/// A regular expense to add or change: name and amount large, the day, the dates it starts and ends on, and its icon.
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
    @State private var confirmDelete = false
    @State private var sender = FormSender()

    var body: some View {
        LilacForm(
            title: item == nil ? "Новая регулярная трата" : nil,
            destructive: item == nil ? nil : (label: "Удалить", action: { confirmDelete = true }),
            primary: item == nil ? "Добавить" : "Сохранить",
            busy: sender.busy,
            save: save
        ) {
            LilacBigFields(title: $title, amount: $amount, placeholder: "Например, аренда", symbol: symbol, errors: sender.errors)
            LilacTextField(label: "Число месяца", text: $day, placeholder: "5", error: sender.errors["day"], keyboard: .number)
            Text("Если числа нет в месяце, например 31-го, платёж приходится на последний день.")
                .font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            LilacPanel {
                LilacPanelLine(title: "Дата начала", first: true) { Toggle("", isOn: $hasStart).labelsHidden() }
                if hasStart { LilacPanelLine(title: "С") { DatePicker("", selection: $start, displayedComponents: .date).labelsHidden() } }
                LilacPanelLine(title: "Дата окончания") { Toggle("", isOn: $hasEnd).labelsHidden() }
                if hasEnd { LilacPanelLine(title: "По") { DatePicker("", selection: $end, displayedComponents: .date).labelsHidden() } }
            }
            .padding(.top, 18)
            FieldError(text: sender.errors["start"] ?? sender.errors["end"])
            LilacFieldLabel(text: "Иконка")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 52))], spacing: 10) {
                iconButton(name: "", symbolName: "textformat", label: "По названию")
                ForEach(icons, id: \.icon) { choice in
                    iconButton(name: choice.icon, symbolName: Icons.symbol(choice.icon), label: choice.label)
                }
            }
        }
        .confirmationDialog("Удалить регулярную трату?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { sender.send(session, "regular/\(item!.expense.id)/delete", [:]) { dismiss() } }
        } message: {
            Text("Траты, привязанные к ней, останутся без привязки.")
        }
        .errorAlert($sender.error)
        .onAppear(perform: fill)
    }

    private func iconButton(name: String, symbolName: String, label: String) -> some View {
        let picked = icon == name
        return Button { icon = name } label: {
            Image(systemName: symbolName)
                .font(.title3)
                .foregroundStyle(picked ? Lilac.accent : Color.primary)
                .frame(width: 50, height: 50)
                .background(picked ? Lilac.tint : Lilac.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(picked ? Lilac.accent : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private func fill() {
        guard let values = item?.values else { return }
        title = values["title"] ?? ""
        amount = Money.typing(values["amount"] ?? "")
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
        sender.send(session, item.map { "regular/\($0.expense.id)" } ?? "regular", form) { dismiss() }
    }
}
