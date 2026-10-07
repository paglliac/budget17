import SwiftUI

/// An expense opened to mark it. On top what it is and what it is now; then one of two ways to say what it was for — a
/// category, or the payment of a regular expense or a purchase it made — each a tap on a tile, shown at once; at the
/// bottom where it counts. Choices post to /api/spending/:id/:choice.
struct MarkingSheet: View {
    enum Mode: Hashable { case category, payment }

    let id: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// nil until picked: the payments when the expense paid one or one is suggested, the categories otherwise.
    @State private var mode: Mode?
    /// A choice made and not yet confirmed by the server, shown as made already.
    @State private var applying: String?
    @State private var showOthers = false
    @State private var error: String?
    @State private var saved = 0
    @Namespace private var switcher

    var body: some View {
        NavigationStack {
            Screen(path: "spending/\(id)") { (s: SpendingScreen) in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header(s)
                        now(s)
                        modeSwitch(s)
                        Group {
                            switch shownMode(s) {
                            case .category: categories(s)
                            case .payment: payments(s)
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        envelopes(s)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
                .background(Ink.canvas)
                .accessibilityIdentifier("marking")
                .onChange(of: s) { withAnimation(.snappy) { applying = nil } }
            }
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } }
            }
            .errorAlert($error)
            .sensoryFeedback(.selection, trigger: applying)
            .sensoryFeedback(.success, trigger: saved)
        }
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
    private func currentPayment(_ s: SpendingScreen) -> (label: String, icon: String)? {
        if let applying, applying.hasPrefix("regular-") || applying.hasPrefix("purchase-") {
            if let c = s.payments.choices.first(where: { $0.choice == applying }) { return (c.label, c.icon ?? "repeat") }
            if let o = s.payments.others.flatMap(\.options).first(where: { $0.value == applying }) { return (o.label, o.icon ?? "repeat") }
        }
        guard let key = current(s.payments.choices, clearedBy: "unlink"), let c = s.payments.choices.first(where: { $0.choice == key }) else { return nil }
        return (c.label, c.icon ?? "repeat")
    }

    private func currentCategory(_ s: SpendingScreen) -> Choice? {
        guard let key = current(s.categories.choices, clearedBy: "uncategorize") else { return nil }
        return s.categories.choices.first { $0.choice == key }
    }

    private func shownMode(_ s: SpendingScreen) -> Mode {
        if let mode { return mode }
        let paid = s.payments.choices.contains { $0.isCurrent || $0.isSuggested }
        return paid && s.categories.choices.allSatisfy { !$0.isCurrent } ? .payment : .category
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

    private func header(_ s: SpendingScreen) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(s.title).font(.title3.weight(.semibold))
            BigAmount(amount: s.amount, symbol: s.symbol, kopecks: true)
            Text("\(s.when) · \(s.account)").font(.subheadline).foregroundStyle(Ink.muted)
            ForEach(s.notes, id: \.self) { note in
                Text(note).font(.footnote).foregroundStyle(Ink.muted)
            }
        }
    }

    /// What the expense is now: the payment it made or its category, and where it counts; the cross takes back what the
    /// app said about it.
    private func now(_ s: SpendingScreen) -> some View {
        let payment = currentPayment(s)
        let category = currentCategory(s)
        let undo = payment != nil ? "unlink" : "uncategorize"
        let canUndo = applying == nil && s.undo.contains { $0.choice == undo }
        let icon = payment?.icon ?? category?.icon ?? "tag"
        let color = payment != nil ? "violet" : (category?.color ?? "gray")
        let title = payment?.label ?? category?.label ?? "Не размечена"
        let subtitle = payment != nil ? "оплатила платёж" : category != nil ? (category?.detail == "из ZenMoney" ? "категория из ZenMoney" : "категория") : "выберите категорию или платёж"
        return HStack(spacing: 12) {
            IconBadge(icon: icon, color: Palette.color(color), size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold)).lineLimit(2)
                Text(subtitle).font(.footnote).foregroundStyle(Ink.muted)
            }
            Spacer(minLength: 8)
            if let envelope = current(s.envelopes, clearedBy: "") {
                HStack(spacing: 5) {
                    MarkDot(mark: envelope)
                    Text(Self.envelopeWords[envelope] ?? "").font(.caption).foregroundStyle(Ink.muted)
                }
            }
            if canUndo {
                Button { choose(undo) } label: {
                    Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Ink.muted.opacity(0.7))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.undo.first { $0.choice == undo }?.label ?? "Отменить")
            }
        }
        .padding(14)
        .background(Ink.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .id(title)
        .transition(.asymmetric(insertion: .scale(scale: 0.9).combined(with: .opacity), removal: .opacity))
    }

    private static let envelopeWords = ["week": "в неделе", "extra": "в дополнительных", "outside": "вне бюджета", "ignored": "не учитывается"]

    /// «Категория» and «Платёж» with a white capsule that slides to the picked one.
    private func modeSwitch(_ s: SpendingScreen) -> some View {
        let shown = shownMode(s)
        return HStack(spacing: 4) {
            ForEach([(Mode.category, "Категория", "square.grid.2x2"), (Mode.payment, "Платёж", "link")], id: \.1) { value, label, icon in
                Button {
                    withAnimation(.snappy) { mode = value }
                } label: {
                    Label(label, systemImage: icon)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .foregroundStyle(shown == value ? Color.primary : Ink.muted)
                        .background {
                            if shown == value {
                                Capsule().fill(Ink.surface).shadow(color: .black.opacity(0.08), radius: 4, y: 1)
                                    .matchedGeometryEffect(id: "mode", in: switcher)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(shown == value ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Ink.hairline, in: Capsule())
    }

    @ViewBuilder
    private func categories(_ s: SpendingScreen) -> some View {
        if s.categories.choices.isEmpty {
            EmptyCard(text: s.categories.empty)
        } else {
            let picked = current(s.categories.choices, clearedBy: "uncategorize")
            // In the server's order, the most popular first: a suggestion goes once a category is picked, and tiles
            // that moved then would jump under the finger.
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(s.categories.choices) { choice in
                    CategoryTile(choice: choice, selected: choice.choice == picked) {
                        if choice.choice != picked { choose(choice.choice) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func payments(_ s: SpendingScreen) -> some View {
        let picked = applying.flatMap { $0.hasPrefix("regular-") || $0.hasPrefix("purchase-") ? $0 : nil } ?? current(s.payments.choices, clearedBy: "unlink")
        VStack(spacing: 10) {
            ForEach(s.payments.choices) { choice in
                PaymentCard(label: choice.label, detail: choice.detail, icon: choice.icon ?? "repeat", selected: choice.choice == picked, suggested: choice.isSuggested) {
                    if choice.choice != picked { choose(choice.choice) }
                }
            }
            if s.payments.choices.isEmpty && s.payments.others.isEmpty {
                EmptyCard(text: s.payments.empty)
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
                    .foregroundStyle(Ink.violet)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                }
                .buttonStyle(.plain)
                if showOthers {
                    ForEach(s.payments.others.filter { !$0.options.isEmpty }, id: \.label) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            SheetLabel(text: group.label)
                            ForEach(group.options, id: \.value) { option in
                                PaymentCard(label: option.label, detail: nil, icon: option.icon ?? "repeat", selected: option.value == picked, suggested: false, compact: true) {
                                    if option.value != picked { choose(option.value) }
                                }
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
    }

    /// Where the expense counts, as small pills; changed seldom, so at the bottom.
    private func envelopes(_ s: SpendingScreen) -> some View {
        let picked = current(s.envelopes, clearedBy: "")
        return VStack(alignment: .leading, spacing: 8) {
            SheetLabel(text: "Где считается")
            FlowLayout(spacing: 8) {
                ForEach(s.envelopes) { choice in
                    Button {
                        if choice.choice != picked { choose(choice.choice) }
                    } label: {
                        HStack(spacing: 6) {
                            // The pill says it in words, so the dot is not read out again; on the picked pill it is
                            // white, as its colour would vanish on violet.
                            Group {
                                if choice.choice == picked && choice.choice != "ignored" {
                                    if choice.choice == "outside" {
                                        Circle().strokeBorder(.white, lineWidth: 1.2).frame(width: 7, height: 7)
                                    } else {
                                        Circle().fill(.white).frame(width: 7, height: 7)
                                    }
                                } else {
                                    MarkDot(mark: choice.choice == "ignored" ? nil : choice.choice)
                                }
                            }
                            .accessibilityHidden(true)
                            if choice.choice == "ignored" { Image(systemName: "eye.slash").font(.caption).accessibilityHidden(true) }
                            Text(choice.label)
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                        .foregroundStyle(choice.choice == picked ? Color.white : Color.primary)
                        .background(choice.choice == picked ? AnyShapeStyle(Ink.violet) : AnyShapeStyle(Ink.surface), in: Capsule())
                    }
                    .buttonStyle(PressableStyle())
                }
            }
        }
    }
}

/// A category as a tile: its icon on its colour and its name; the picked one has a violet frame and a check, the
/// suggested one sparkles.
struct CategoryTile: View {
    let choice: Choice
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                IconBadge(icon: choice.icon ?? "tag", color: Palette.color(choice.color ?? "gray"), size: 42)
                Text(choice.label)
                    .font(.footnote.weight(.medium))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                if let detail = choice.detail {
                    Text(detail).font(.caption2).foregroundStyle(Ink.muted)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 108)
            .padding(.horizontal, 6)
            .background(Ink.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(selected ? Ink.violet : .clear, lineWidth: 2)
            }
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white, Ink.violet)
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

/// A payment the expense could have made: a regular expense or a purchase, with its date or plan and what is left.
struct PaymentCard: View {
    let label: String
    let detail: String?
    let icon: String
    let selected: Bool
    let suggested: Bool
    var compact = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                IconBadge(icon: icon, color: Palette.color(selected ? "violet" : "gray"), size: compact ? 32 : 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(compact ? .subheadline : .body.weight(.medium)).lineLimit(2)
                    if let detail { Text(detail).font(.footnote).foregroundStyle(Ink.muted) }
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.white, Ink.violet)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                } else if suggested {
                    Label("похоже", systemImage: "sparkles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.week)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, compact ? 10 : 12)
            .background(Ink.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(selected ? Ink.violet : .clear, lineWidth: 2)
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A button that gives a little under the finger.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}
