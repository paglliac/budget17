import SwiftUI

/// An expense opened to mark it. On top what it is: whom it went to, how much and when, what the bank said and what is
/// suggested, then what it is now. Then one of two ways to say what it was for — a category, or the payment of a regular
/// expense or a purchase it made — each a tap on a tile, shown at once; at the bottom where it counts, as large cards.
/// Opened from the expenses that wait for a category, it steps through them: «1 из 4». Choices post to
/// /api/spending/:id/:choice.
struct MarkingSheet: View {
    enum Mode: Hashable { case category, payment }

    /// The expenses to step through, this one among them; empty for one expense alone.
    let queue: [String]
    @State private var id: String
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// nil until picked: the payments when the expense paid one or one is suggested, the categories otherwise.
    @State private var mode: Mode?
    /// A choice made and not yet confirmed by the server, shown as made already.
    @State private var applying: String?
    @State private var showOthers = false
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
                    VStack(alignment: .leading, spacing: 18) {
                        header(s)
                        now(s)
                        LilacSegmented(
                            items: [Segment(value: Mode.category, label: "Категория"), Segment(value: Mode.payment, label: "Платёж")],
                            selection: Binding(get: { shownMode(s) }, set: { mode = $0 }),
                            width: nil
                        )
                        Group {
                            switch shownMode(s) {
                            case .category: categories(s)
                            case .payment: payments(s)
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        envelopes(s)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .accessibilityIdentifier("marking")
                .onChange(of: s) { withAnimation(.snappy) { applying = nil } }
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
    }

    // MARK: - Stepping

    private var index: Int? { queue.firstIndex(of: id) }

    private var next: String? {
        guard let index, index + 1 < queue.count else { return nil }
        return queue[index + 1]
    }

    private func step(to other: String) {
        withAnimation(.snappy) {
            id = other
            mode = nil
            applying = nil
            showOthers = false
        }
    }

    private var topBar: some View {
        HStack(spacing: 4) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 18, weight: .medium)).frame(width: 40, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Готово")
            Spacer()
            if let index, queue.count > 1 {
                Button { step(to: queue[index - 1]) } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
                    .buttonStyle(.plain)
                    .disabled(index == 0)
                    .opacity(index == 0 ? 0.3 : 1)
                    .accessibilityLabel("Предыдущая")
                Text("\(index + 1) из \(queue.count)").font(.subheadline).foregroundStyle(Lilac.muted).monospacedDigit()
                Button { if let next { step(to: next) } } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                    .buttonStyle(.plain)
                    .disabled(next == nil)
                    .opacity(next == nil ? 0.3 : 1)
                    .accessibilityLabel("Следующая")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
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

    /// The expense in the middle: what it is for on a large disc, the exact amount, whom it went to, when and from where,
    /// what else the bank said and what is suggested.
    private func header(_ s: SpendingScreen) -> some View {
        let payment = currentPayment(s)
        let category = currentCategory(s)
        let color = Palette.color(payment != nil ? "violet" : (category?.color ?? "gray"))
        return VStack(spacing: 6) {
            ZStack {
                Circle().fill(Lilac.surface).frame(width: 108, height: 108).shadow(color: .black.opacity(0.07), radius: 16, y: 6)
                Circle().fill(color.opacity(0.15)).frame(width: 60, height: 60)
                Image(systemName: Icons.symbol(payment?.icon ?? category?.icon ?? "tag")).font(.system(size: 24, weight: .semibold)).foregroundStyle(color)
            }
            .padding(.bottom, 10)
            Text(Money.exact(s.amount, s.symbol)).font(.system(size: 38, weight: .bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(s.title).font(.title3).multilineTextAlignment(.center)
            Text("\(s.when) · \(s.account)").font(.subheadline).foregroundStyle(Lilac.muted)
            ForEach(s.notes + (s.hint.map { [$0] } ?? []), id: \.self) { note in
                Text(note).font(.subheadline).foregroundStyle(Lilac.muted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    /// What the expense is now: the payment it made or its category, and where it counts; the cross takes back what the
    /// app said about it.
    private func now(_ s: SpendingScreen) -> some View {
        let payment = currentPayment(s)
        let category = currentCategory(s)
        let undo = payment != nil ? "unlink" : "uncategorize"
        let canUndo = applying == nil && s.undo.contains { $0.choice == undo }
        let title = payment?.label ?? category?.label ?? "Не размечена"
        let subtitle = payment != nil ? "оплатила платёж" : category != nil ? (category?.detail == "из ZenMoney" ? "категория из ZenMoney" : "категория") : "выберите категорию или платёж"
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold)).lineLimit(2)
                Text(subtitle).font(.footnote).foregroundStyle(Lilac.muted)
            }
            Spacer(minLength: 8)
            if let envelope = current(s.envelopes, clearedBy: "") {
                Text(Self.envelopeWords[envelope] ?? "")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(envelope == "week" ? Lilac.accent : Lilac.muted)
                    .padding(.horizontal, 8)
                    .frame(height: 22)
                    .background((envelope == "week" ? Lilac.tint : Lilac.track), in: Capsule())
            }
            if canUndo {
                Button { choose(undo) } label: {
                    Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Lilac.muted.opacity(0.7))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.undo.first { $0.choice == undo }?.label ?? "Отменить")
            }
        }
        .padding(16)
        .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .id(title)
        .transition(.asymmetric(insertion: .scale(scale: 0.95).combined(with: .opacity), removal: .opacity))
    }

    private static let envelopeWords = ["week": "в неделе", "extra": "в дополнительных", "outside": "вне бюджета", "ignored": "не учитывается"]

    @ViewBuilder
    private func categories(_ s: SpendingScreen) -> some View {
        if s.categories.choices.isEmpty {
            LilacEmpty(text: s.categories.empty)
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

    /// Where the expense counts, as large cards with what each means; the picked one is lilac.
    private func envelopes(_ s: SpendingScreen) -> some View {
        let picked = current(s.envelopes, clearedBy: "")
        return VStack(alignment: .leading, spacing: 10) {
            Text("Где считается").font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 6)
            ForEach(s.envelopes) { choice in
                let selected = choice.choice == picked
                Button {
                    if !selected { choose(choice.choice) }
                } label: {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(selected ? Lilac.accent.opacity(0.16) : Lilac.track)
                            if selected {
                                Image(systemName: Self.envelopeIcons[choice.choice] ?? "circle").font(.system(size: 15, weight: .semibold)).foregroundStyle(Lilac.accent)
                            } else {
                                Circle().fill(Lilac.muted.opacity(0.6)).frame(width: 7, height: 7)
                            }
                        }
                        .frame(width: 42, height: 42)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(choice.label).font(.body.weight(.semibold)).foregroundStyle(Color.primary)
                            if let detail = choice.detail { Text(detail).font(.footnote).foregroundStyle(Lilac.muted) }
                        }
                        Spacer(minLength: 8)
                        if selected { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Lilac.accent) }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(selected ? Lilac.tint : Lilac.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(color: .black.opacity(selected ? 0 : 0.05), radius: 8, y: 3)
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(choice.label)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private static let envelopeIcons = ["week": "calendar", "extra": "bag", "outside": "arrow.uturn.right", "ignored": "eye.slash"]
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
                Image(systemName: Icons.symbol(choice.icon ?? "tag"))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(color)
                    .frame(width: 44, height: 44)
                    .background(color.opacity(0.15), in: Circle())
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
                Image(systemName: Icons.symbol(icon))
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

/// A button that gives a little under the finger.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}
