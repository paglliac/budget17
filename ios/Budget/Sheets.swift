import SwiftUI

/// What opens over a list: an expense to mark (with the ones to step to after it), a purchase or a wish to add or
/// change, a regular expense, what a week allows.
enum BudgetSheet: Identifiable, Hashable {
    case spending(String, queue: [String] = [])
    case purchase(PurchaseDraft)
    case wish(WishItem?)
    case regular(Int)
    case weekLimit(WeekLimitDraft)

    var id: String {
        switch self {
        case .spending(let id, _): "spending-\(id)"
        case .purchase(let draft): "purchase-\(draft.purchase.map { String($0.id) } ?? "new-\(draft.envelope)")"
        case .wish(let item): "wish-\(item.map { String($0.wish.id) } ?? "new")"
        case .regular(let id): "regular-\(id)"
        case .weekLimit(let draft): "week-limit-\(draft.week)"
        }
    }
}

/// What a week allows, to change: its first day, its title and its amount with the usual one.
struct WeekLimitDraft: Hashable {
    let week: String
    let title: String
    let limit: WeekLimit
    let symbol: String
}

/// A purchase to add, into a week and the week's money or the extras, or one to change.
struct PurchaseDraft: Hashable {
    let purchase: Purchase?
    let week: String
    let envelope: String
    let choices: [OptionGroup]
    let actions: [PurchaseAction]
    var symbol = "₽"
}

extension View {
    func budgetSheets(_ sheet: Binding<BudgetSheet?>) -> some View {
        self.sheet(item: sheet) { sheet in
            switch sheet {
            case .spending(let id, let queue): MarkingSheet(id: id, queue: queue)
            case .purchase(let draft): PurchaseSheet(draft: draft)
            case .wish(let item): WishSheet(item: item)
            case .regular(let id): RegularLoader(id: id)
            case .weekLimit(let draft): WeekLimitSheet(draft: draft)
            }
        }
    }
}

/// Sends a form of a sheet, closes the sheet once it is saved, and keeps the errors of its fields to show under them.
@Observable
final class FormSender {
    var errors: [String: String] = [:]
    var error: String?
    var busy = false

    func send(_ session: Session, _ path: String, _ form: [String: String], then done: @escaping () -> Void) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await session.send(path, form)
                done()
            } catch APIError.invalid(let errors) {
                self.errors = errors
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Purchases and wishes

/// Another amount for a week, such as less when something happened, or the usual one back.
struct WeekLimitSheet: View {
    let draft: WeekLimitDraft
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""
    @State private var sender = FormSender()

    var body: some View {
        LilacForm(title: "Бюджет недели", primary: "Сохранить", busy: sender.busy, save: {
            sender.send(session, "week-limits/\(draft.week)", ["amount": amount]) { dismiss() }
        }) {
            Text(draft.title).font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 12)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                TextField(Money.input(draft.limit.usual), text: $amount)
                    .font(.system(size: 44, weight: .bold))
                    .monospacedDigit()
                    .decimalKeyboard()
                    .fixedSize()
                    .accessibilityIdentifier("form-amount")
                    .onChange(of: amount) { _, typed in
                        let grouped = Money.typing(typed)
                        if grouped != typed { amount = grouped }
                    }
                Text(draft.symbol).font(.system(size: 44, weight: .bold))
            }
            .padding(.top, 4)
            FieldError(text: sender.errors["amount"])
            if draft.limit.changed {
                LilacInlineAction(label: "Вернуть \(Money.text(draft.limit.usual, draft.symbol))") {
                    sender.send(session, "week-limits/\(draft.week)/delete", [:]) { dismiss() }
                }
                .padding(.top, 16)
            }
        }
        .presentationDetents([.medium])
        .errorAlert($sender.error)
        .onAppear { amount = Money.typing(Money.input(draft.limit.amount)) }
    }
}

/// A purchase: its name and amount large, whether it is required or flexible, its week and, for a new one, whether it
/// comes from the week's money or the extras; one to change also moves, finishes or goes.
struct PurchaseSheet: View {
    let draft: PurchaseDraft
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var week = ""
    @State private var envelope = "week"
    @State private var kind = "flexible"
    @State private var confirmDelete = false
    @State private var sender = FormSender()

    private static let kinds = [
        LilacChoiceTiles.Choice(value: "required", title: "Обязательная", hint: "Лучше не трогать"),
        LilacChoiceTiles.Choice(value: "flexible", title: "Гибкая", hint: "Можно перенести"),
    ]

    var body: some View {
        LilacForm(
            destructive: draft.purchase == nil ? nil : (label: "Удалить", action: { confirmDelete = true }),
            primary: draft.purchase == nil ? "В план" : "Сохранить",
            busy: sender.busy,
            save: save
        ) {
            LilacBigFields(title: $title, amount: $amount, placeholder: draft.envelope == "extra" ? "Например, куртка" : "Например, ботинки",
                           symbol: draft.symbol, errors: sender.errors)

            LilacFieldLabel(text: "Тип траты")
            LilacChoiceTiles(choices: Self.kinds, selection: $kind)

            LilacFieldLabel(text: "Неделя")
            HStack {
                Picker("Неделя", selection: $week) {
                    ForEach(weekGroups, id: \.label) { group in
                        Section(group.label) {
                            ForEach(group.options, id: \.value) { Text($0.label).tag($0.value) }
                        }
                    }
                }
                .labelsHidden()
                .tint(Color.primary)
                Spacer()
            }
            .padding(.horizontal, 8)
            .frame(minHeight: 52)
            .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)

            if draft.purchase == nil {
                LilacFieldLabel(text: "Откуда")
                LilacSegmented(items: [Segment(value: "week", label: "Из недели"), Segment(value: "extra", label: "Из дополнительных")],
                               selection: $envelope, width: nil)
            } else if let purchase = draft.purchase {
                HStack(spacing: 10) {
                    ForEach(draft.actions, id: \.action) { action in
                        LilacInlineAction(label: action.label) {
                            // Moving saves the fields too, as on the web form; finishing needs none.
                            sender.send(session, "purchases/\(purchase.id)/\(action.action)", action.action == "move" ? fields : [:]) { dismiss() }
                        }
                    }
                }
                .padding(.top, 20)
            }
        }
        .presentationDetents([.large])
        .accessibilityIdentifier("purchase-sheet")
        .confirmationDialog("Удалить покупку?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { sender.send(session, "purchases/\(draft.purchase!.id)/delete", [:]) { dismiss() } }
        }
        .errorAlert($sender.error)
        .onAppear {
            title = draft.purchase?.title ?? ""
            amount = draft.purchase.map { Money.typing(Money.input($0.amount)) } ?? ""
            week = draft.week
            envelope = draft.envelope
            kind = draft.purchase?.kind ?? "flexible"
        }
    }

    /// The weeks to pick from, with the purchase's own week even when it is out of their range.
    private var weekGroups: [OptionGroup] {
        let all = draft.choices.flatMap(\.options).map(\.value)
        guard let purchase = draft.purchase, !all.contains(purchase.week) else { return draft.choices }
        return [OptionGroup(label: "Сейчас", options: [Option(value: purchase.week, label: purchase.weekLabel)])] + draft.choices
    }

    private var fields: [String: String] { ["title": title, "amount": amount, "week": week, "kind": kind] }

    private func save() {
        if let purchase = draft.purchase {
            sender.send(session, "purchases/\(purchase.id)", fields) { dismiss() }
        } else {
            sender.send(session, "purchases", fields.merging(["envelope": envelope]) { $1 }) { dismiss() }
        }
    }
}

/// A wish: its name and amount large, and when it can be bought; one to change is planned or goes.
struct WishSheet: View {
    let item: WishItem?
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var sender = FormSender()

    var body: some View {
        LilacForm(
            destructive: item.map { item in (label: "Удалить", action: { sender.send(session, "wishes/\(item.wish.id)/delete", [:]) { dismiss() } }) },
            primary: item == nil ? "Хочу" : "Сохранить",
            busy: sender.busy,
            save: { sender.send(session, item.map { "wishes/\($0.wish.id)" } ?? "wishes", ["title": title, "amount": amount]) { dismiss() } }
        ) {
            LilacBigFields(title: $title, amount: $amount, placeholder: "Например, укладка для волос", symbol: "₽", errors: sender.errors)
            if let item {
                Text(item.row.details).font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 18)
                if item.plannable {
                    LilacInlineAction(label: "Запланировать") { sender.send(session, "wishes/\(item.wish.id)/plan", [:]) { dismiss() } }
                        .padding(.top, 8)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .errorAlert($sender.error)
        .onAppear {
            title = item?.wish.title ?? ""
            amount = item.map { Money.typing(Money.input($0.wish.amount)) } ?? ""
        }
    }
}

/// The name of a purchase or a wish, large and light, and its amount larger and heavy, as the reference's form draws
/// them; the amount keeps its thousands apart as it is typed.
struct LilacBigFields: View {
    @Binding var title: String
    @Binding var amount: String
    let placeholder: String
    let symbol: String
    let errors: [String: String]

    var body: some View {
        TextField(placeholder, text: $title, axis: .vertical)
            .font(.system(size: 32, weight: .regular))
            .lineLimit(1...3)
            .padding(.top, 8)
            .accessibilityIdentifier("form-title")
        FieldError(text: errors["title"])
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            TextField("0", text: $amount)
                .font(.system(size: 44, weight: .bold))
                .monospacedDigit()
                .decimalKeyboard()
                .fixedSize()
                .accessibilityIdentifier("form-amount")
                .onChange(of: amount) { _, typed in
                    let grouped = Money.typing(typed)
                    if grouped != typed { amount = grouped }
                }
            Text(symbol).font(.system(size: 44, weight: .bold)).foregroundStyle(amount.isEmpty ? Lilac.muted.opacity(0.6) : Color.primary)
        }
        .padding(.top, 6)
        FieldError(text: errors["amount"])
    }
}

/// A regular expense opened from a week's plan, found among all of them.
struct RegularLoader: View {
    let id: Int

    var body: some View {
        Screen(path: "regular") { (s: RegularScreen) in
            if let item = (s.behind + s.ahead + s.later).first(where: { $0.expense.id == id }) {
                RegularSheet(item: item, icons: s.icons, symbol: s.symbol)
            } else {
                ContentUnavailableView("Регулярной траты больше нет", systemImage: "repeat")
            }
        }
    }
}
