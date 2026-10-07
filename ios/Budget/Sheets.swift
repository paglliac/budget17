import SwiftUI

/// What opens over a list: an expense to mark, a purchase or a wish to add or change, a regular expense.
enum BudgetSheet: Identifiable, Hashable {
    case spending(String)
    case purchase(PurchaseDraft)
    case wish(WishItem?)
    case regular(Int)

    var id: String {
        switch self {
        case .spending(let id): "spending-\(id)"
        case .purchase(let draft): "purchase-\(draft.purchase.map { String($0.id) } ?? "new-\(draft.envelope)")"
        case .wish(let item): "wish-\(item.map { String($0.wish.id) } ?? "new")"
        case .regular(let id): "regular-\(id)"
        }
    }
}

/// A purchase to add, into a week and the week's money or the extras, or one to change.
struct PurchaseDraft: Hashable {
    let purchase: Purchase?
    let week: String
    let envelope: String
    let choices: [OptionGroup]
    let actions: [PurchaseAction]
}

extension View {
    func budgetSheets(_ sheet: Binding<BudgetSheet?>) -> some View {
        self.sheet(item: sheet) { sheet in
            switch sheet {
            case .spending(let id): MarkingSheet(id: id)
            case .purchase(let draft): PurchaseSheet(draft: draft)
            case .wish(let item): WishSheet(item: item)
            case .regular(let id): RegularLoader(id: id)
            }
        }
    }
}

// MARK: - Purchases and wishes

struct PurchaseSheet: View {
    let draft: PurchaseDraft
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var week = ""
    @State private var envelope = "week"
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(draft.envelope == "extra" ? "Например, куртка" : "Например, ботинки", text: $title)
                    FieldError(text: errors["title"])
                    TextField("Сумма", text: $amount).decimalKeyboard()
                    FieldError(text: errors["amount"])
                }
                Section {
                    Picker("Неделя", selection: $week) {
                        ForEach(weekGroups, id: \.label) { group in
                            Section(group.label) {
                                ForEach(group.options, id: \.value) { Text($0.label).tag($0.value) }
                            }
                        }
                    }
                    if draft.purchase == nil {
                        Picker("Откуда", selection: $envelope) {
                            Text("Из недели").tag("week")
                            Text("Из дополнительных").tag("extra")
                        }
                        .pickerStyle(.segmented)
                    }
                }
                if let purchase = draft.purchase {
                    Section {
                        ForEach(draft.actions, id: \.action) { action in
                            Button(action.label) { run(action: action.action, purchase: purchase) }
                        }
                        Button("Удалить", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(draft.purchase == nil ? "Новая покупка" : "Покупка")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(draft.purchase == nil ? "В план" : "Сохранить") { save() }.disabled(busy)
                }
            }
            .presentationDetents([.medium, .large])
            .confirmationDialog("Удалить покупку?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { submit("purchases/\(draft.purchase!.id)/delete", [:]) }
            }
            .errorAlert($error)
            .onAppear {
                title = draft.purchase?.title ?? ""
                amount = draft.purchase.map { Money.input($0.amount) } ?? ""
                week = draft.week
                envelope = draft.envelope
            }
        }
    }

    /// The weeks to pick from, with the purchase's own week even when it is out of their range.
    private var weekGroups: [OptionGroup] {
        let all = draft.choices.flatMap(\.options).map(\.value)
        guard let purchase = draft.purchase, !all.contains(purchase.week) else { return draft.choices }
        return [OptionGroup(label: "Сейчас", options: [Option(value: purchase.week, label: purchase.weekLabel)])] + draft.choices
    }

    private var fields: [String: String] { ["title": title, "amount": amount, "week": week] }

    private func save() {
        if let purchase = draft.purchase {
            submit("purchases/\(purchase.id)", fields)
        } else {
            submit("purchases", fields.merging(["envelope": envelope]) { $1 })
        }
    }

    /// Moving saves the fields too, as on the web form; finishing needs none.
    private func run(action: String, purchase: Purchase) {
        submit("purchases/\(purchase.id)/\(action)", action == "move" ? fields : [:])
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

struct WishSheet: View {
    let item: WishItem?
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Например, укладка для волос", text: $title)
                    FieldError(text: errors["title"])
                    TextField("Сумма", text: $amount).decimalKeyboard()
                    FieldError(text: errors["amount"])
                } footer: {
                    if let item { Text(item.row.details) }
                }
                if let item {
                    Section {
                        if item.plannable {
                            Button("Запланировать") { submit("wishes/\(item.wish.id)/plan", [:]) }
                        }
                        Button("Удалить", role: .destructive) { submit("wishes/\(item.wish.id)/delete", [:]) }
                    }
                }
            }
            .navigationTitle(item == nil ? "Новое желание" : "Желание")
            .inlineTitle()
            .presentationDetents([.medium, .large])
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(item == nil ? "Хочу" : "Сохранить") {
                        submit(item.map { "wishes/\($0.wish.id)" } ?? "wishes", ["title": title, "amount": amount])
                    }
                    .disabled(busy)
                }
            }
            .errorAlert($error)
            .onAppear {
                title = item?.wish.title ?? ""
                amount = item.map { Money.input($0.wish.amount) } ?? ""
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
