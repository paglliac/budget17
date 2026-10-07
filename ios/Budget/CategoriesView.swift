import SwiftUI

/// Categories for marking in the order marking offers them; ZenMoney's can be renamed or hidden, the user's own
/// added and deleted. ZenMoney itself never changes.
struct CategoriesPanel: View {
    let frame: MoreFrame
    @State private var editing: CategoryItem?
    @State private var adding = false

    var body: some View {
        Screen(path: "categories") { (s: CategoriesScreen) in
            SplitScreen {
                frame.header
            } summary: {
                VStack(alignment: .leading, spacing: 10) {
                    SummaryLabel("Категории при разметке")
                    Text("\(s.shown.count)").font(.system(size: 38, weight: .semibold, design: .rounded))
                    if !s.hidden.isEmpty {
                        Text("ещё \(s.hidden.count) \(Words.plural(s.hidden.count, "скрыта", "скрыты", "скрыто"))")
                            .font(.footnote)
                            .foregroundStyle(Ink.muted)
                    }
                }
            } band: {
                frame.band
            } content: {
                ForEach(s.shown) { item in card(item) }
                AddCard(label: "Добавить категорию") { adding = true }
                if !s.hidden.isEmpty {
                    SheetLabel(text: "Скрытые")
                    ForEach(s.hidden) { item in card(item) }
                }
            }
            .sheet(item: $editing) { item in CategorySheet(item: item) }
            .sheet(isPresented: $adding) { CategorySheet(item: nil) }
        }
    }

    private func card(_ item: CategoryItem) -> some View {
        Button { editing = item } label: { Card(row: item.row, symbol: "") }
            .buttonStyle(.plain)
    }
}

struct CategorySheet: View {
    let item: CategoryItem?
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var errors: [String: String] = [:]
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(item?.category.zenmoneyTitle ?? "Например, дети", text: $title)
                    FieldError(text: errors["title"])
                } footer: {
                    if let original = item?.category.zenmoneyTitle {
                        Text("В ZenMoney она называется «\(original)»; пустое поле вернёт это название.")
                    }
                }
                if let category = item?.category {
                    Section {
                        Button(category.hidden ? "Показать при разметке" : "Скрыть при разметке") {
                            submit("categories/\(category.id)/\(category.hidden ? "show" : "hide")", [:])
                        }
                        if category.zenmoneyTitle == nil {
                            Button("Удалить", role: .destructive) { submit("categories/\(category.id)/delete", [:]) }
                        }
                    } footer: {
                        if category.zenmoneyTitle == nil { Text("Траты удалённой категории останутся без категории.") }
                    }
                }
            }
            .navigationTitle(item == nil ? "Новая категория" : "Категория")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(item == nil ? "Добавить" : "Сохранить") {
                        submit(item.map { "categories/\($0.category.id)" } ?? "categories", ["title": title])
                    }
                    .disabled(busy)
                }
            }
            .errorAlert($error)
            .onAppear { title = item?.category.name ?? "" }
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
