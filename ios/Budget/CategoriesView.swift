import PhotosUI
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
            .sheet(item: $editing) { item in CategorySheet(item: item, kind: item.category.kind, icons: s.icons ?? [], colors: s.colors ?? []) }
            .sheet(item: $adding) { new in CategorySheet(item: nil, kind: new.kind, icons: s.icons ?? [], colors: s.colors ?? []) }
        }
    }

    private func rows(_ items: [CategoryItem]) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            Button { editing = item } label: {
                LilacRow(marker: .icon(item.row), title: item.row.title, details: item.row.details, amount: nil, symbol: "", muted: item.row.muted,
                         first: index == 0)
            }
            .buttonStyle(.card)
            .accessibilityIdentifier(item.id)
        }
    }
}

/// A category to add, for expenses or incomes, or one to rename, dress, hide or show, and delete when it is the user's
/// own. How it looks shows on top as it is picked: an icon in a colour, or a photo of the phone instead of the icon, on
/// the colour, which shows through a photo with a clear ground.
struct CategorySheet: View {
    let item: CategoryItem?
    /// expense or income.
    let kind: String
    let icons: [IconChoice]
    let colors: [ColorChoice]
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    /// The icon and colour picked; empty for the category's own.
    @State private var icon = ""
    @State private var color = ""
    /// A photo picked on the phone, as the server takes it, shown as `picture`; empty takes the category's off, nil
    /// leaves it as it is.
    @State private var photo: String?
    @State private var picture: Image?
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var sender = FormSender()

    var body: some View {
        let category = item?.category
        LilacForm(
            title: item == nil ? (kind == "income" ? "Новая категория дохода" : "Новая категория") : "Категория",
            destructive: category.flatMap { c in c.zenmoneyTitle == nil ? (label: "Удалить", action: { sender.send(session, "categories/\(c.id)/delete", [:]) { dismiss() } }) : nil },
            primary: item == nil ? "Добавить" : "Сохранить",
            busy: sender.busy,
            save: save
        ) {
            disc.frame(maxWidth: .infinity).padding(.top, 6)
            LilacTextField(label: "Название", text: $title, placeholder: category?.zenmoneyTitle ?? (kind == "income" ? "Например, кэшбэк" : "Например, дети"), error: sender.errors["title"])
            if let original = category?.zenmoneyTitle {
                Text("В ZenMoney она называется «\(original)»; пустое поле вернёт это название.")
                    .font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            } else if category != nil {
                Text("\(kind == "income" ? "Доходы" : "Траты") удалённой категории останутся без категории.").font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 6)
            }
            LilacFieldLabel(text: "Иконка")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 46), spacing: 8)], spacing: 8) {
                iconButton("", symbol: "textformat", label: "По названию")
                ForEach(icons, id: \.icon) { choice in iconButton(choice.icon, symbol: Icons.symbol(choice.icon), label: choice.label) }
            }
            LilacFieldLabel(text: "Цвет")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 38), spacing: 10)], spacing: 10) {
                swatch("", shown: autoColor, label: "Как у категории")
                ForEach(colors, id: \.value) { choice in swatch(choice.value, shown: Palette.color(choice.value), label: choice.label) }
                if isCustom { swatch(color, shown: Palette.color(color), label: "Свой цвет") }
                ColorPicker("Свой цвет", selection: Binding(get: { shownColor }, set: { color = Self.hex($0) ?? color }), supportsOpacity: false)
                    .labelsHidden()
                    .frame(width: 38, height: 38)
            }
            LilacFieldLabel(text: "Фото вместо иконки")
            HStack(spacing: 8) {
                // The picker draws its label off the main actor, so it gets the colours as they are.
                let (label, accent, tint) = (hasPhoto ? "Другое фото" : "Выбрать фото", Lilac.accent, Lilac.tint)
                PhotosPicker(selection: $pickedPhoto, matching: .images) {
                    Label(label, systemImage: "photo")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 12)
                        .frame(height: 28)
                        .foregroundStyle(accent)
                        .background(tint, in: Capsule())
                }
                if hasPhoto {
                    LilacInlineAction(label: "Убрать фото") { withAnimation(.snappy) { photo = ""; picture = nil } }
                }
            }
            FieldError(text: sender.errors["photo"])
            if let category {
                LilacInlineAction(label: category.hidden ? "Показать при разметке" : "Скрыть при разметке") {
                    sender.send(session, "categories/\(category.id)/\(category.hidden ? "show" : "hide")", [:]) { dismiss() }
                }
                .padding(.top, 22)
            }
        }
        .presentationDetents([.large])
        .errorAlert($sender.error)
        .onAppear {
            title = category?.name ?? ""
            icon = category?.icon ?? ""
            color = category?.color ?? ""
        }
        .onChange(of: pickedPhoto) { load(pickedPhoto) }
    }

    // MARK: - What is picked

    private var shownColor: Color { color.isEmpty ? autoColor : Palette.color(color) }

    private var autoColor: Color { Palette.color(item?.category.auto?.color ?? "gray") }

    private var shownIcon: String { icon.isEmpty ? (item?.category.auto?.icon ?? "tag") : icon }

    /// A colour of the wheel, not one of the swatches.
    private var isCustom: Bool { !color.isEmpty && !colors.contains { $0.value.caseInsensitiveCompare(color) == .orderedSame } }

    /// The category's photo as the server has it, unless it is being taken off or replaced.
    private var savedPhoto: String? { photo == nil ? item?.row.photo : nil }

    private var hasPhoto: Bool { picture != nil || savedPhoto != nil }

    /// The category as it will look.
    @ViewBuilder private var disc: some View {
        if let picture {
            picture.resizable().scaledToFill().frame(width: 76, height: 76).background(shownColor).clipShape(Circle())
        } else {
            CategoryDisc(icon: shownIcon, color: shownColor, photo: savedPhoto, size: 76)
        }
    }

    private func iconButton(_ name: String, symbol: String, label: String) -> some View {
        let picked = icon == name
        return Button { withAnimation(.snappy) { icon = name } } label: {
            Image(systemName: symbol)
                .font(.system(size: 18))
                .foregroundStyle(picked ? shownColor : Color.primary)
                .frame(width: 46, height: 46)
                .background(picked ? shownColor.opacity(0.16) : Lilac.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(picked ? shownColor : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private func swatch(_ value: String, shown: Color, label: String) -> some View {
        let picked = color.caseInsensitiveCompare(value) == .orderedSame
        return Button { withAnimation(.snappy) { color = value } } label: {
            Circle()
                .fill(shown)
                .frame(width: 32, height: 32)
                .overlay { if value.isEmpty { Text("A").font(.caption.weight(.bold)).foregroundStyle(.white) } }
                .padding(3)
                .overlay(Circle().strokeBorder(picked ? Color.primary : .clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    // MARK: - Photo and saving

    private func load(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let url = await Task.detached(operation: { CategoryPhoto.dataURL(data) }).value,
                  let image = CategoryPhoto.image(url)
            else {
                sender.error = "Не получилось открыть фото."
                return
            }
            withAnimation(.snappy) {
                photo = url
                picture = image
            }
            pickedPhoto = nil
        }
    }

    private func save() {
        var form = ["title": title, "kind": kind, "icon": icon, "color": color]
        if let photo { form["photo"] = photo }
        sender.send(session, item.map { "categories/\($0.category.id)" } ?? "categories", form) { dismiss() }
    }

    /// A colour of the wheel as the server takes it, #RRGGBB.
    private static func hex(_ color: Color) -> String? {
        let resolved = color.resolve(in: EnvironmentValues()).cgColor
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let rgb = resolved.converted(to: space, intent: .defaultIntent, options: nil)?.components, rgb.count >= 3
        else { return nil }
        let byte = { (value: CGFloat) in Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", byte(rgb[0]), byte(rgb[1]), byte(rgb[2]))
    }
}
