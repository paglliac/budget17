import SwiftUI

/// Categories for marking in the order marking offers them, then the income ones; ZenMoney's can be renamed or hidden,
/// the user's own added and deleted. ZenMoney itself never changes.
struct CategoriesPanel: View {
    @State private var editing: CategoryItem?
    @State private var adding: NewCategory?

    /// A category being added, for expenses or incomes.
    private struct NewCategory: Identifiable {
        /// expense or income.
        let kind: String
        var id: String { kind }
    }

    var body: some View {
        Screen(path: "categories") { (s: CategoriesScreen) in
            MorePage {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Категории при разметке").font(.subheadline).foregroundStyle(Lilac.muted)
                    Text("\(s.shown.count)").font(.system(size: 36, weight: .bold)).monospacedDigit()
                    if !s.hidden.isEmpty {
                        Text("ещё \(s.hidden.count) \(Words.plural(s.hidden.count, "скрыта", "скрыты", "скрыто"))")
                            .font(.subheadline)
                            .foregroundStyle(Lilac.muted)
                    }
                }
                rows(s.shown).padding(.top, 10)
                LilacAddRow(label: "Добавить категорию") { adding = NewCategory(kind: "expense") }
                LilacHeading("Доходы")
                rows(s.income.shown)
                LilacAddRow(label: "Добавить категорию дохода") { adding = NewCategory(kind: "income") }
                let hidden = s.hidden + s.income.hidden
                if !hidden.isEmpty {
                    LilacHeading("Скрытые")
                    rows(hidden)
                }
            }
            .sheet(item: $editing) { item in CategorySheet(item: item, kind: item.category.kind) }
            .sheet(item: $adding) { new in CategorySheet(item: nil, kind: new.kind) }
        }
    }

    private func rows(_ items: [CategoryItem]) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            Button { editing = item } label: {
                LilacRow(marker: .icon(item.row), title: item.row.title, details: item.row.details, amount: nil, symbol: "", muted: item.row.muted,
                         first: index == 0)
            }
            .buttonStyle(.card)
        }
    }
}

/// A category to add, for expenses or incomes, or one to rename, hide or show, and delete when it is the user's own.
struct CategorySheet: View {
    let item: CategoryItem?
    /// expense or income.
    let kind: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var sender = FormSender()

    var body: some View {
        let category = item?.category
        LilacForm(
            title: item == nil ? (kind == "income" ? "Новая категория дохода" : "Новая категория") : "Категория",
            destructive: category.flatMap { c in c.zenmoneyTitle == nil ? (label: "Удалить", action: { sender.send(session, "categories/\(c.id)/delete", [:]) { dismiss() } }) : nil },
            primary: item == nil ? "Добавить" : "Сохранить",
            busy: sender.busy,
            save: { sender.send(session, item.map { "categories/\($0.category.id)" } ?? "categories", ["title": title, "kind": kind]) { dismiss() } }
        ) {
            LilacTextField(label: "Название", text: $title, placeholder: category?.zenmoneyTitle ?? (kind == "income" ? "Например, кэшбэк" : "Например, дети"), error: sender.errors["title"])
            if let original = category?.zenmoneyTitle {
                Text("В ZenMoney она называется «\(original)»; пустое поле вернёт это название.")
                    .font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            } else if category != nil {
                Text("\(kind == "income" ? "Доходы" : "Траты") удалённой категории останутся без категории.").font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            }
            if let category {
                LilacInlineAction(label: category.hidden ? "Показать при разметке" : "Скрыть при разметке") {
                    sender.send(session, "categories/\(category.id)/\(category.hidden ? "show" : "hide")", [:]) { dismiss() }
                }
                .padding(.top, 16)
            }
        }
        .presentationDetents([.medium, .large])
        .errorAlert($sender.error)
        .onAppear { title = item?.category.name ?? "" }
    }
}
