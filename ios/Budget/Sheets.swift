import SwiftUI

/// What opens over a list: an expense to mark, a purchase or a wish to add or change, a regular expense, what a week
/// allows.
enum BudgetSheet: Identifiable, Hashable {
    case spending(String)
    case purchase(PurchaseDraft)
    case wish(WishItem?)
    case regular(Int)
    case weekLimit(WeekLimitDraft)

    var id: String {
        switch self {
        case .spending(let id): "spending-\(id)"
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
            case .spending(let id): MarkingSheet(id: id)
            case .purchase(let draft): PurchaseSheet(draft: draft)
            case .wish(let item): WishSheet(item: item)
            case .regular(let id): RegularLoader(id: id)
            case .weekLimit(let draft): WeekLimitSheet(draft: draft)
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
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section(draft.title) {
                    TextField(Money.input(draft.limit.usual), text: $amount).decimalKeyboard()
                    FieldError(text: errors["amount"])
                }
                if draft.limit.changed {
                    Section {
                        Button("Вернуть \(Money.text(draft.limit.usual, draft.symbol))") { submit("week-limits/\(draft.week)/delete", [:]) }
                    }
                }
            }
            .navigationTitle("Бюджет недели")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { submit("week-limits/\(draft.week)", ["amount": amount]) }.disabled(busy)
                }
            }
            .presentationDetents([.medium])
            .errorAlert($error)
            .onAppear { amount = Money.input(draft.limit.amount) }
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

/// A purchase in the new style: its name and amount large, whether it is required or flexible, its week and, for a new
/// one, whether it comes from the week's money or the extras; one to change also moves, finishes or goes.
struct PurchaseSheet: View {
    let draft: PurchaseDraft
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var week = ""
    @State private var envelope = "week"
    @State private var kind = "flexible"
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var busy = false

    private static let kinds = [
        LilacChoiceTiles.Choice(value: "required", title: "Обязательная", hint: "Лучше не трогать"),
        LilacChoiceTiles.Choice(value: "flexible", title: "Гибкая", hint: "Можно перенести"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .medium)).frame(width: 40, height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Отмена")
                Spacer()
                if draft.purchase != nil {
                    Button("Удалить") { confirmDelete = true }.foregroundStyle(Lilac.red)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TextField(draft.envelope == "extra" ? "Например, куртка" : "Например, ботинки", text: $title, axis: .vertical)
                        .font(.system(size: 32, weight: .regular))
                        .lineLimit(1...3)
                        .accessibilityIdentifier("purchase-title")
                    FieldError(text: errors["title"])
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        TextField("0", text: $amount)
                            .font(.system(size: 44, weight: .bold))
                            .monospacedDigit()
                            .decimalKeyboard()
                            .fixedSize()
                            .accessibilityIdentifier("purchase-amount")
                            .onChange(of: amount) { _, typed in
                                let grouped = Money.typing(typed)
                                if grouped != typed { amount = grouped }
                            }
                        Text(draft.symbol).font(.system(size: 44, weight: .bold)).foregroundStyle(amount.isEmpty ? Lilac.muted.opacity(0.6) : Color.primary)
                    }
                    .padding(.top, 6)
                    FieldError(text: errors["amount"])

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
                    .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: .black.opacity(0.05), radius: 8, y: 3)

                    if draft.purchase == nil {
                        LilacFieldLabel(text: "Откуда")
                        LilacSegmented(items: [BandItem(value: "week", label: "Из недели"), BandItem(value: "extra", label: "Из дополнительных")],
                                       selection: $envelope, width: nil)
                    } else if let purchase = draft.purchase {
                        HStack(spacing: 10) {
                            ForEach(draft.actions, id: \.action) { action in
                                Button(action.label) { run(action: action.action, purchase: purchase) }
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Lilac.accent)
                                    .padding(.horizontal, 16)
                                    .frame(height: 40)
                                    .background(Lilac.tint, in: Capsule())
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 24)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            LilacPrimaryButton(label: draft.purchase == nil ? "В план" : "Сохранить", busy: busy) { save() }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
                .accessibilityIdentifier("purchase-save")
        }
        .background(LilacBackground())
        .presentationDetents([.large])
        .accessibilityIdentifier("purchase-sheet")
        .confirmationDialog("Удалить покупку?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { submit("purchases/\(draft.purchase!.id)/delete", [:]) }
        }
        .errorAlert($error)
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
