import SwiftUI

/// Categories for marking in the order marking offers them; ZenMoney's can be renamed or hidden, the user's own
/// added and deleted. ZenMoney itself never changes.
struct CategoriesPanel: View {
    @State private var editing: CategoryItem?
    @State private var adding = false

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
                LilacAddRow(label: "Добавить категорию") { adding = true }
                if !s.hidden.isEmpty {
                    LilacHeading("Скрытые")
                    rows(s.hidden)
                }
            }
            .sheet(item: $editing) { item in CategorySheet(item: item) }
            .sheet(isPresented: $adding) { CategorySheet(item: nil) }
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

/// A category to add, or one to rename, hide or show, and delete when it is the user's own.
struct CategorySheet: View {
    let item: CategoryItem?
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var sender = FormSender()

    var body: some View {
        let category = item?.category
        LilacForm(
            title: item == nil ? "Новая категория" : "Категория",
            destructive: category.flatMap { c in c.zenmoneyTitle == nil ? (label: "Удалить", action: { sender.send(session, "categories/\(c.id)/delete", [:]) { dismiss() } }) : nil },
            primary: item == nil ? "Добавить" : "Сохранить",
            busy: sender.busy,
            save: { sender.send(session, item.map { "categories/\($0.category.id)" } ?? "categories", ["title": title]) { dismiss() } }
        ) {
            LilacTextField(label: "Название", text: $title, placeholder: category?.zenmoneyTitle ?? "Например, дети", error: sender.errors["title"])
            if let original = category?.zenmoneyTitle {
                Text("В ZenMoney она называется «\(original)»; пустое поле вернёт это название.")
                    .font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            } else if category != nil {
                Text("Траты удалённой категории останутся без категории.").font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
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
