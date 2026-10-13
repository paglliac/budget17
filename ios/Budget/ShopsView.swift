import PhotosUI
import SwiftUI

/// The shops of the last three months on a tab of «Ещё», the most frequent first, or those a search finds by what they
/// are called or a name the bank gives them; a shop opens to be named and dressed for all its operations. An expense
/// opens its shop here as `opening`, once its own sheet has gone.
struct ShopsPanel: View {
    @Binding var opening: Shop?
    @State private var editing: Shop?
    @State private var search = ""
    @State private var query: String?

    var body: some View {
        Screen(path: "shops", query: ["q": query]) { (s: ShopsScreen) in
            MorePage {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Магазины за три месяца").font(.subheadline).foregroundStyle(Lilac.muted)
                    Text("\(s.recent)").font(.system(size: 36, weight: .bold)).monospacedDigit()
                }
                searchField.padding(.top, 12)
                if s.items.isEmpty {
                    Text("Таких магазинов нет").font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 18)
                }
                ForEach(Array(s.items.enumerated()), id: \.element.id) { index, item in
                    Button { editing = item.shop } label: {
                        LilacRow(marker: item.row.logo.map { .logo($0) } ?? .icon(item.row), title: item.row.title, details: item.row.details, amount: nil, symbol: "",
                                 first: index == 0)
                    }
                    .buttonStyle(.card)
                    .accessibilityIdentifier(item.row.id)
                }
            }
        }
        .sheet(item: $editing) { ShopSheet(shop: $0) }
        .task(id: opening) {
            guard let opening else { return }
            editing = opening
            self.opening = nil
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Lilac.muted)
            TextField("Найти магазин", text: $search)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onSubmit { query = search.isEmpty ? nil : search }
            if !search.isEmpty {
                Button {
                    search = ""
                    query = nil
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Lilac.muted)
                }
                .accessibilityLabel("Очистить")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Lilac.surface, in: Capsule())
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .padding(.bottom, 10)
    }
}

/// A shop as the user names and dresses it for all its operations, opened on its tab: on top how it will look, then its
/// name, the site its logo comes from and a photo instead of the logo, and under them what it is made of, the names the
/// bank gives it with how many operations went by each; shops are merged on the web. An empty field keeps what the shop would have, the name and site of its chain or the bank's name. Posts to
/// /api/shops/:key with title, site and photo, to its photo/delete and, for «Сбросить», to its forget.
struct ShopSheet: View {
    let shop: Shop
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var site = ""
    /// A photo picked on the phone, as the server takes it, shown as `picture`; empty takes the shop's off, nil leaves
    /// it as it is.
    @State private var photo: String?
    @State private var picture: Image?
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var sender = FormSender()

    private var path: String { "shops/\(shop.key)" }

    var body: some View {
        LilacForm(
            title: "Магазин",
            destructive: shop.dressed ? (label: "Сбросить", action: { sender.send(session, "\(path)/forget", [:]) { dismiss() } }) : nil,
            primary: "Сохранить",
            busy: sender.busy,
            save: save
        ) {
            disc.frame(maxWidth: .infinity).padding(.top, 6)
            LilacTextField(label: "Название", text: $title, placeholder: shop.placeholder, error: sender.errors["title"])
            LilacTextField(label: "Сайт для значка", text: $site, placeholder: shop.sitePlaceholder, error: sender.errors["site"], keyboard: .url)
            LilacFieldLabel(text: "Фото вместо значка")
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
            if let names = shop.names, !names.isEmpty {
                LilacFieldLabel(text: "Из чего состоит")
                LilacPanel {
                    ForEach(Array(names.enumerated()), id: \.offset) { index, name in
                        LilacPanelLine(title: name.name, first: index == 0) { Text("\(name.count)").monospacedDigit().foregroundStyle(Lilac.muted) }
                    }
                }
            } else {
                Text(shop.note).font(.footnote).foregroundStyle(Lilac.muted).padding(.top, 18)
            }
        }
        .presentationDetents([.large])
        .errorAlert($sender.error)
        .onAppear {
            title = shop.title
            site = shop.site
        }
        .onChange(of: pickedPhoto) { load(pickedPhoto) }
    }

    /// The user's photo as the server has it, unless it is being taken off or replaced.
    private var hasPhoto: Bool { picture != nil || (shop.photo && photo == nil) }

    /// The shop as it will look: the photo just picked, its logo, or a bag until it has either. A logo of its site that
    /// is new comes once the form is saved.
    @ViewBuilder private var disc: some View {
        if let picture {
            picture.resizable().scaledToFill().frame(width: 76, height: 76).background(Color.white).clipShape(Circle())
        } else if let logo = shop.logo, !(shop.photo && photo == "") {
            LilacMarker.logo(logo).view.frame(width: 76, height: 76)
        } else {
            CategoryDisc(icon: "bag", color: Palette.color("gray"), size: 76)
        }
    }

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
        var form = ["title": title, "site": site]
        if let photo { form["photo"] = photo }
        sender.send(session, path, form) { dismiss() }
    }
}
