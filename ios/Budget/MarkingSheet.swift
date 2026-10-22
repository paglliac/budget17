import SwiftUI

/// An expense opened to mark it, after the user's picture of 2026-10-22. On top whom it went to, when and from where,
/// and the exact amount. Then what the user writes about it, large on a lilac cloud, sent once typing pauses. Under it
/// three lines, each with one step: what of the plan it paid, whose step unfolds the payments, or links the one that
/// looks like it; where it counts, with what that means for the week and «Вернуть в неделю» when it was moved out of it;
/// and «Категория и другие настройки» with the category's icon and whether it could have been done without, which unfolds the
/// categories as tiles, the switch, the shop and what else the bank said. A tap on a line unfolds its choices, and a
/// pick folds them back. While the expense has neither a category nor a payment the last line is unfolded. Opened
/// from the expenses that wait for a category, it steps through them: «1 из 4». An income opens the same way, only it
/// pays nothing, so it has no line of the plan, and it counts among the incomes or not at all.
/// Choices post to /api/spending/:id/:choice, the description to /api/spending/:id/description.
struct MarkingSheet: View {
    /// The lines of the sheet that unfold their choices.
    private enum Part { case plan, place, more }

    /// The expenses to step through, this one among them; empty for one expense alone.
    let queue: [String]
    @State private var id: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openShop) private var openShop
    /// A choice made and not yet confirmed by the server, shown as made already.
    @State private var applying: String?
    @State private var showOthers = false
    /// The lines unfolded by a tap.
    @State private var unfolded: Set<Part> = []
    /// Whether «Категория и другие настройки» was tapped open or shut; until then it is open while nothing is picked.
    @State private var more: Bool?
    /// «Трата» or «Доход», once the server says which.
    @State private var heading = "Трата"
    /// The description as typed, until the server sends it back.
    @State private var draft: String?
    /// The draft last sent, so a pause, leaving the field and then the sheet send it once.
    @State private var sent: String?
    /// Whether the server has kept the description since it was last typed.
    @State private var kept = false
    /// The description waiting for a pause in typing to be sent.
    @State private var pause: Task<Void, Never>?
    @FocusState private var writing: Bool
    @State private var error: String?
    @State private var saved = 0

    init(id: String, queue: [String] = []) {
        self.queue = queue
        _id = State(initialValue: id)
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Screen(path: "spending/\(id)") { (s: SpendingScreen) in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header(s)
                        description(s)
                        if !s.isIncome { plan(s) }
                        place(s)
                        settings(s)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("marking")
                .onAppear { heading = s.isIncome ? "Доход" : "Трата" }
                .onChange(of: s) {
                    heading = s.isIncome ? "Доход" : "Трата"
                    withAnimation(.snappy) { applying = nil }
                    if !writing, let draft, Self.oneLine(draft) == (s.description ?? "") {
                        self.draft = nil
                        sent = nil
                    }
                }
            }
            .id(id)
            if let next = next {
                LilacPrimaryButton(label: "Дальше") { step(to: next) }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
        .background(LilacBackground())
        .presentationDetents([.large])
        .errorAlert($error)
        .sensoryFeedback(.selection, trigger: applying)
        .sensoryFeedback(.success, trigger: saved)
        .onChange(of: writing) { if !writing { saveDescription() } }
        .onDisappear { saveDescription() }
    }

    // MARK: - Stepping

    private var index: Int? { queue.firstIndex(of: id) }

    private var next: String? {
        guard let index, index + 1 < queue.count else { return nil }
        return queue[index + 1]
    }

    private func step(to other: String) {
        saveDescription()
        withAnimation(.snappy) {
            id = other
            applying = nil
            showOthers = false
            unfolded = []
            more = nil
            draft = nil
            sent = nil
            kept = false
        }
    }

    /// Back on the left, the title in the middle, and in a queue where the expense is in it with arrows up and down to
    /// the one before and after, as Mail steps through letters.
    private var topBar: some View {
        ZStack {
            Text(heading).font(.headline)
            HStack(spacing: 2) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 20, weight: .medium)).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Готово")
                Spacer()
                if let index, queue.count > 1 {
                    Text("\(index + 1) из \(queue.count)").font(.subheadline).foregroundStyle(Lilac.muted).monospacedDigit().padding(.trailing, 4)
                    Button { step(to: queue[index - 1]) } label: { Image(systemName: "chevron.up").frame(width: 34, height: 44) }
                        .buttonStyle(.plain)
                        .disabled(index == 0)
                        .opacity(index == 0 ? 0.3 : 1)
                        .accessibilityLabel("Предыдущая")
                    Button { if let next { step(to: next) } } label: { Image(systemName: "chevron.down").frame(width: 34, height: 44) }
                        .buttonStyle(.plain)
                        .disabled(next == nil)
                        .opacity(next == nil ? 0.3 : 1)
                        .accessibilityLabel("Следующая")
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    // MARK: - What is chosen

    /// The choice of a group that counts as made: the one being made, else the server's.
    private func current(_ choices: [Choice], clearedBy undo: String) -> String? {
        if let applying {
            if choices.contains(where: { $0.choice == applying }) { return applying }
            if applying == undo { return nil }
        }
        return choices.first(where: \.isCurrent)?.choice
    }

    /// The payment the expense made, among the likely ones or the others.
    private func currentPayment(_ s: SpendingScreen) -> (label: String, detail: String?, icon: String)? {
        if let applying, ["regular-", "purchase-", "wish-", "save-"].contains(where: applying.hasPrefix) {
            if let c = s.payments.choices.first(where: { $0.choice == applying }) { return (c.label, c.detail, c.icon ?? "repeat") }
            if let o = s.payments.others.flatMap(\.options).first(where: { $0.value == applying }) { return (o.label, nil, o.icon ?? "repeat") }
        }
        guard let key = current(s.payments.choices, clearedBy: "unlink"), let c = s.payments.choices.first(where: { $0.choice == key }) else { return nil }
        return (c.label, c.detail, c.icon ?? "repeat")
    }

    private func currentCategory(_ s: SpendingScreen) -> Choice? {
        guard let key = current(s.categories.choices, clearedBy: "uncategorize") else { return nil }
        return s.categories.choices.first { $0.choice == key }
    }

    /// Whether the expense could have been done without, as switched a moment ago or as the server says.
    private func isOptional(_ s: SpendingScreen) -> Bool {
        applying == "optional" ? true : applying == "required" ? false : s.optional?.current ?? false
    }

    private func canUndo(_ s: SpendingScreen, _ undo: String) -> Bool {
        applying == nil && s.undo.contains { $0.choice == undo }
    }

    private func isOpen(_ part: Part, _ s: SpendingScreen) -> Bool {
        part == .more ? more ?? (currentPayment(s) == nil && currentCategory(s) == nil) : unfolded.contains(part)
    }

    private func toggle(_ part: Part, _ s: SpendingScreen) {
        let open = isOpen(part, s)
        withAnimation(.snappy) {
            if part == .more {
                more = !open
            } else if open {
                unfolded.remove(part)
            } else {
                unfolded.insert(part)
            }
        }
    }

    /// Makes a choice, and folds the line it was made on once its tick has shown, unless the sheet has moved to another
    /// expense by then.
    private func pick(_ choice: String, folding part: Part) {
        if part == .more { more = true }
        choose(choice)
        let spending = id
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard id == spending else { return }
            withAnimation(.snappy) {
                if part == .more { more = false } else { unfolded.remove(part) }
            }
        }
    }

    private func choose(_ choice: String) {
        withAnimation(.snappy) { applying = choice }
        Task {
            do {
                try await session.send("spending/\(id)/\(choice)")
                saved += 1
            } catch {
                withAnimation(.snappy) { applying = nil }
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Parts

    /// The icon, colour and photo of what is picked: the payment, the category, or for neither an arrow coming in for an
    /// income and a grey tag for an expense.
    private func look(_ s: SpendingScreen) -> (icon: String, color: Color, photo: String?) {
        if let payment = currentPayment(s) { return (payment.icon, Palette.color("violet"), nil) }
        if let category = currentCategory(s) { return (category.icon ?? "tag", Palette.color(category.color ?? "gray"), category.photo) }
        return s.isIncome ? ("arrowDownLeft", Palette.color("green"), nil) : ("tag", Palette.color("gray"), nil)
    }

    /// The expense in a line: its shop's logo, or else what it went for, on a disc; its shop, or else its title, over the
    /// day and where from; the exact amount at the end. What it paid has a line of its own, and the time is among what
    /// else the bank said.
    private func header(_ s: SpendingScreen) -> some View {
        let (icon, color, photo) = look(s)
        return HStack(spacing: 16) {
            ZStack {
                if let logo = s.shop?.logo {
                    LilacMarker.logo(logo).view
                } else if let photo {
                    CategoryDisc(icon: icon, color: color, photo: photo, size: 52)
                } else {
                    Circle().fill(color.opacity(0.14))
                    Image(systemName: Icons.symbol(icon)).font(.system(size: 20, weight: .medium)).foregroundStyle(color)
                }
            }
            .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(s.shop.map { $0.title.isEmpty ? $0.placeholder : $0.title } ?? s.title).font(.system(size: 19, weight: .medium)).lineLimit(2)
                Text("\(Self.day(s.when)) · \(s.account)").font(.callout).foregroundStyle(Lilac.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 8)
            Text(Money.exact(s.amount, s.symbol)).font(.system(size: 20, weight: .bold)).monospacedDigit().lineLimit(1).fixedSize()
        }
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    /// What the user wrote about the expense, large on a lilac cloud; it is sent when typing pauses, on return and when
    /// the field or the sheet is left, and says so once the server has it.
    private func description(_ s: SpendingScreen) -> some View {
        let text = Binding(
            get: { draft ?? s.description ?? "" },
            set: { typed in
                if typed.contains("\n") {
                    draft = typed.replacingOccurrences(of: "\n", with: " ")
                    writing = false
                } else {
                    draft = typed
                    waitForPause()
                }
                withAnimation(.snappy) { kept = false }
            }
        )
        return VStack(alignment: .leading, spacing: 12) {
            Text(s.isIncome ? "Что это за доход?" : "Что это за трата?").font(.subheadline).foregroundStyle(Lilac.muted)
            TextField(s.isIncome ? "Например, долг" : "Например, обед", text: text, axis: .vertical)
                .font(.system(size: 28))
                .lineLimit(1...4)
                .focused($writing)
                .submitLabel(.done)
                .tint(Lilac.accent)
                .accessibilityIdentifier("description")
            if kept && !(draft ?? s.description ?? "").isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Lilac.accent)
                        .frame(width: 26, height: 26)
                        .background(Lilac.accent.opacity(0.16), in: Circle())
                    Text("Сохранено только что").font(.subheadline).foregroundStyle(Lilac.muted)
                }
                .transition(.opacity)
                .accessibilityIdentifier("description-kept")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            LilacBlob()
                .fill(LinearGradient(colors: [Lilac.tint.opacity(0.7), Lilac.tint, Lilac.tint.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .blur(radius: 10)
                .padding(.horizontal, -20)
        }
        .padding(.bottom, 8)
    }

    /// Sends the description once typing stops for a moment.
    private func waitForPause() {
        pause?.cancel()
        pause = Task {
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            saveDescription()
        }
    }

    /// Sends the description typed, once; an empty one takes it away.
    private func saveDescription() {
        pause?.cancel()
        guard let draft, draft != sent else { return }
        sent = draft
        let path = "spending/\(id)/description"
        let spending = id
        Task {
            do {
                try await session.send(path, ["description": draft])
                saved += 1
                if id == spending, self.draft == draft { withAnimation(.snappy) { kept = true } }
            } catch {
                sent = nil
                self.error = error.localizedDescription
            }
        }
    }

    /// The day of «21 октября, 17:41», without the time.
    private static func day(_ when: String) -> String {
        when.components(separatedBy: ", ").first ?? when
    }

    /// The description as the server keeps it: in one line, without extra spaces.
    private static func oneLine(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// What of the plan the expense paid: the payment with its day or plan, whose step unfolds the others; or, linked to
    /// nothing, the payment it looks like with a step that links it, or a step that unfolds the payments.
    private func plan(_ s: SpendingScreen) -> some View {
        let payment = currentPayment(s)
        let likely = payment == nil ? s.payments.choices.first(where: \.isSuggested) : nil
        let open = isOpen(.plan, s)
        return VStack(alignment: .leading, spacing: 0) {
            LilacStepRow(
                icon: Icons.symbol(payment?.icon ?? "tag"),
                color: payment == nil ? nil : Lilac.accent,
                title: payment?.label ?? "Не связано с планом",
                detail: payment?.detail ?? likely.map { ["Похоже на «\($0.label)»", $0.detail].compactMap { $0 }.joined(separator: " · ") },
                step: payment != nil ? "Изменить" : likely != nil ? "Связать" : "Связать с покупкой",
                identifier: "plan",
                stepIdentifier: "plan-step",
                toggle: { toggle(.plan, s) },
                act: {
                    if let likely { pick(likely.choice, folding: .plan) } else { toggle(.plan, s) }
                }
            )
            if open {
                VStack(alignment: .leading, spacing: 10) {
                    payments(s)
                    if canUndo(s, "unlink") {
                        LilacInlineAction(label: s.undo.first { $0.choice == "unlink" }?.label ?? "Отвязать") { pick("unlink", folding: .plan) }
                    }
                }
                .padding(.bottom, 18)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    /// Where the expense counts and what that means for the week, with a step back into the week when it was moved out
    /// of it; an income's step counts it or not. A tap on the line unfolds every place to pick another.
    private func place(_ s: SpendingScreen) -> some View {
        let picked = current(s.envelopes, clearedBy: "") ?? s.envelopes.first?.choice ?? "week"
        let words = Self.placeWords[s.isIncome && picked == "ignored" ? "ignored-income" : picked] ?? (s.envelopes.first { $0.choice == picked }?.label ?? "", "")
        let back: (label: String, choice: String)? =
            s.isIncome ? (picked == "counted" ? ("Не учитывать", "ignored") : ("Учитывать", "counted"))
            : picked != "week" && s.envelopes.contains(where: { $0.choice == "week" }) ? ("Вернуть в неделю", "week") : nil
        let open = isOpen(.place, s)
        return VStack(alignment: .leading, spacing: 0) {
            LilacStepRow(
                icon: Self.envelopeIcons[picked] ?? "circle",
                color: picked == "ignored" ? nil : Lilac.accent,
                title: words.title,
                detail: words.detail.isEmpty ? nil : "\(Money.text(s.amount, s.symbol)) \(words.detail)",
                step: back?.label ?? (picked == "week" ? "Перенести" : "Изменить"),
                identifier: "place",
                stepIdentifier: "place-step",
                toggle: { toggle(.place, s) },
                act: {
                    if let back { pick(back.choice, folding: .place) } else { toggle(.place, s) }
                }
            )
            if open {
                VStack(spacing: 10) {
                    ForEach(Array(s.envelopes.enumerated()), id: \.element.id) { index, choice in
                        PaymentCard(label: choice.label, detail: choice.detail, symbol: Self.envelopeIcons[choice.choice] ?? "circle",
                                    selected: choice.choice == picked, suggested: false, compact: true) {
                            if choice.choice != picked { pick(choice.choice, folding: .place) }
                        }
                        .modifier(Unfold(index: index))
                        .accessibilityLabel(choice.label)
                    }
                }
                .padding(.bottom, 18)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    /// The category, by its icon on its colour, and whether the expense could have been done without, in a line that
    /// unfolds the categories as tiles to pick another, the switch, the shop and what else the bank said; without a
    /// category, a grey tag and the one it looks like with a step that takes it.
    private func settings(_ s: SpendingScreen) -> some View {
        let category = currentCategory(s)
        let likely = category == nil ? s.categories.choices.first(where: \.isSuggested) : nil
        let named = category?.label ?? likely.map { "Похоже на «\($0.label)»" } ?? (s.categories.choices.isEmpty ? nil : "Без категории")
        let summary = [named, isOptional(s) ? s.optional?.label : nil].compactMap { $0 }.joined(separator: " · ")
        let open = isOpen(.more, s)
        return VStack(alignment: .leading, spacing: 0) {
            LilacStepRow(
                icon: Icons.symbol(category?.icon ?? "tag"),
                color: category.map { Palette.color($0.color ?? "gray") },
                photo: category?.photo,
                title: "Категория и другие настройки",
                detail: summary.isEmpty ? nil : summary,
                step: likely == nil ? nil : "Принять",
                open: open,
                identifier: "more",
                stepIdentifier: "more-step",
                toggle: { toggle(.more, s) },
                act: { if let likely { pick(likely.choice, folding: .more) } }
            )
            if open {
                VStack(alignment: .leading, spacing: 14) {
                    categories(s)
                    if canUndo(s, "uncategorize") {
                        LilacInlineAction(label: s.undo.first { $0.choice == "uncategorize" }?.label ?? "Убрать категорию") { pick("uncategorize", folding: .more) }
                    }
                    optional(s)
                    if let found = s.shop { shopButton(found) }
                    ForEach([s.when] + s.notes, id: \.self) { note in
                        Text(note).font(.subheadline).foregroundStyle(Lilac.muted)
                    }
                }
                .padding(.bottom, 18)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    /// The shop with a pencil, which closes the sheet for the shop on its tab, to name and dress it for all its expenses.
    private func shopButton(_ found: Shop) -> some View {
        Button {
            dismiss()
            openShop(found)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "storefront").font(.subheadline).foregroundStyle(Lilac.muted)
                Text("Магазин «\(found.title.isEmpty ? found.placeholder : found.title)»").foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                Image(systemName: "pencil").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.muted)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("shop")
    }

    /// Whether the expense could have been done without, as a switch on a card; it shows turned at once.
    @ViewBuilder
    private func optional(_ s: SpendingScreen) -> some View {
        if let option = s.optional {
            let on = isOptional(s)
            Toggle(isOn: Binding(get: { on }, set: { choose($0 ? "optional" : "required") })) {
                HStack(spacing: 12) {
                    Image(systemName: "cart.badge.minus").font(.subheadline).foregroundStyle(on ? Palette.optional : Lilac.muted)
                    Text(option.label).foregroundStyle(Color.primary)
                }
            }
            .tint(Palette.optional)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
            .accessibilityIdentifier("optional")
        }
    }

    @ViewBuilder
    private func categories(_ s: SpendingScreen) -> some View {
        if s.categories.choices.isEmpty {
            LilacEmpty(text: s.categories.empty)
        } else {
            let picked = current(s.categories.choices, clearedBy: "uncategorize")
            // In the server's order, the most popular first: a suggestion goes once a category is picked, and tiles
            // that moved then would jump under the finger.
            // A grid that is not lazy, so the tiles unfold together when it opens, not as they scroll in.
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                ForEach(Array(stride(from: 0, to: s.categories.choices.count, by: 3)), id: \.self) { start in
                    GridRow {
                        ForEach(start..<start + 3, id: \.self) { index in
                            if index < s.categories.choices.count {
                                let choice = s.categories.choices[index]
                                CategoryTile(choice: choice, selected: choice.choice == picked) {
                                    if choice.choice != picked { pick(choice.choice, folding: .more) }
                                }
                                .modifier(Unfold(index: index))
                            } else {
                                Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func payments(_ s: SpendingScreen) -> some View {
        let picked = applying.flatMap { ["regular-", "purchase-", "wish-", "save-"].contains(where: $0.hasPrefix) ? $0 : nil } ?? current(s.payments.choices, clearedBy: "unlink")
        VStack(spacing: 10) {
            ForEach(Array(s.payments.choices.enumerated()), id: \.element.id) { index, choice in
                PaymentCard(label: choice.label, detail: choice.detail, symbol: Icons.symbol(choice.icon ?? "repeat"), selected: choice.choice == picked, suggested: choice.isSuggested) {
                    if choice.choice != picked { pick(choice.choice, folding: .plan) }
                }
                .modifier(Unfold(index: index))
                .accessibilityIdentifier("payment")
            }
            if s.payments.choices.isEmpty && s.payments.others.isEmpty {
                LilacEmpty(text: s.payments.empty)
            }
            if !s.payments.others.isEmpty {
                Button {
                    withAnimation(.snappy) { showOthers.toggle() }
                } label: {
                    HStack {
                        Text(s.payments.otherLabel).font(.subheadline.weight(.medium))
                        Spacer()
                        Image(systemName: "chevron.down").rotationEffect(.degrees(showOthers ? 180 : 0))
                    }
                    .foregroundStyle(Lilac.accent)
                    .padding(.horizontal, 4)
                    .frame(height: 44)
                }
                .buttonStyle(.plain)
                if showOthers {
                    ForEach(s.payments.others.filter { !$0.options.isEmpty }, id: \.label) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(group.label).font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 6)
                            ForEach(group.options, id: \.value) { option in
                                PaymentCard(label: option.label, detail: nil, symbol: Icons.symbol(option.icon ?? "repeat"), selected: option.value == picked, suggested: false, compact: true) {
                                    if option.value != picked { pick(option.value, folding: .plan) }
                                }
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
    }

    /// Where an expense or an income counts, as the line of the sheet names it, with what its amount does there; in the
    /// week, where an expense counts unless moved, that goes without saying.
    private static let placeWords: [String: (title: String, detail: String)] = [
        "week": ("Учитывается в неделе", ""),
        "extra": ("Из дополнительных", "из доп. бюджета месяца"),
        "outside": ("Не учитывается в неделе", "не уменьшают свободное на неделю"),
        "ignored": ("Не учитывается", "нет ни в неделе, ни в суммах месяца"),
        "counted": ("Учитывается в доходах", "в полученном и накоплениях месяца"),
        "ignored-income": ("Не учитывается", "нет в полученном и накоплениях месяца"),
    ]

    private static let envelopeIcons = ["week": "calendar", "extra": "bag", "outside": "arrow.uturn.right", "ignored": "eye.slash", "counted": "arrow.down.left"]
}

/// A category as a tile: its icon on a halo of its colour and its name; the picked one is lilac with a tick, the
/// suggested one sparkles.
struct CategoryTile: View {
    let choice: Choice
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let color = Palette.color(choice.color ?? "gray")
        Button(action: action) {
            VStack(spacing: 8) {
                if let photo = choice.photo {
                    CategoryDisc(icon: choice.icon ?? "tag", color: color, photo: photo, size: 44)
                } else {
                    Image(systemName: Icons.symbol(choice.icon ?? "tag"))
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(color)
                        .frame(width: 44, height: 44)
                        .background(color.opacity(0.15), in: Circle())
                }
                Text(choice.label)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color.primary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                if let detail = choice.detail {
                    Text(detail).font(.caption2).foregroundStyle(Lilac.muted)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 84)
            .padding(.horizontal, 6)
            .padding(.vertical, 12)
            .background(selected ? Lilac.tint : Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(selected ? Lilac.accent : .clear, lineWidth: 1.5)
            }
            .shadow(color: .black.opacity(selected ? 0 : 0.05), radius: 8, y: 3)
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white, Lilac.accent)
                        .padding(6)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                } else if choice.isSuggested {
                    Label("похоже", systemImage: "sparkles")
                        .labelStyle(.iconOnly)
                        .font(.caption)
                        .foregroundStyle(Palette.week)
                        .padding(8)
                }
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(choice.isSuggested && !selected ? "\(choice.label), похоже" : choice.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A payment the expense could have made: a regular expense or a purchase, with its date or plan and what is left; or a
/// place it can count in, as compact.
struct PaymentCard: View {
    let label: String
    let detail: String?
    /// An SF Symbol's name.
    let symbol: String
    let selected: Bool
    let suggested: Bool
    var compact = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
                    .foregroundStyle(selected ? Lilac.accent : Lilac.muted)
                    .frame(width: compact ? 32 : 40, height: compact ? 32 : 40)
                    .background((selected ? Lilac.accent : Lilac.muted).opacity(0.15), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(compact ? .subheadline : .body.weight(.medium)).foregroundStyle(Color.primary).lineLimit(2)
                    if let detail { Text(detail).font(.footnote).foregroundStyle(Lilac.muted) }
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white, Lilac.accent)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                } else if suggested {
                    Label("похоже", systemImage: "sparkles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.week)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, compact ? 10 : 13)
            .background(selected ? Lilac.tint : Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(selected ? Lilac.accent : .clear, lineWidth: 1.5)
            }
            .shadow(color: .black.opacity(selected ? 0 : 0.05), radius: 8, y: 3)
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Comes in a moment after the one before it, so tiles unfold from the top when they open.
private struct Unfold: ViewModifier {
    let index: Int
    @State private var shown: Bool

    /// Not `animated`, it is there at once, as the place picked is when the sheet opens.
    init(index: Int, animated: Bool = true) {
        self.index = index
        _shown = State(initialValue: !animated)
    }

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 0.88)
            .offset(y: shown ? 0 : -6)
            .onAppear {
                withAnimation(.snappy(duration: 0.3).delay(Double(min(index, 15)) * 0.018)) { shown = true }
            }
    }
}

/// A button that gives a little under the finger.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}
