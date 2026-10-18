import SwiftUI

// A wish opened from «Хочу купить» or from the money its plan holds: what it is and by when, the ways to afford it as
// cards to pick together, each with its part on a slider, what they make step by step, and at the bottom what they
// gather with the choice. The server works the plan out (src/wish-plans.ts) and keeps the one chosen.

/// The wish's page: its name, amount and day, the ways, and the plan.
struct WishPlanSheet: View {
    let id: Int
    /// The ways picked as the server takes them; nil shows the chosen plan.
    @State private var ways: String?
    /// The wish as loaded, to change from «Изменить».
    @State private var wish: Wish?
    @State private var editing: Wish?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .medium)).frame(width: 40, height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Готово")
                Spacer()
                if let wish { Button("Изменить") { editing = wish }.foregroundStyle(Lilac.accent) }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            Screen(path: "wish", query: ["id": String(id), "ways": ways]) { (s: WishScreen) in
                WishPlanContent(screen: s, ways: $ways)
                    .task(id: s.wish) { wish = Wish(id: s.wish.id, title: s.wish.title, amount: s.wish.amount) }
            }
        }
        .background(LilacBackground())
        .presentationDetents([.large])
        .sheet(item: $editing) { wish in WishSheet(wish: wish, deleted: { dismiss() }) }
    }
}

extension Wish: Identifiable {}

struct WishPlanContent: View {
    let screen: WishScreen
    @Binding var ways: String?
    @Environment(Session.self) private var session
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        let s = screen
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(s.wish.title).font(.system(size: 32, weight: .regular)).lineLimit(2).padding(.top, 4)
                LilacAmount(amount: s.wish.amount, symbol: s.symbol, size: 44).padding(.top, 2)
                DueLine(screen: s) { due in post("wishes/\(s.wish.id)/due", ["due": due]) }
                    .padding(.top, 10)
                if let saved = s.saved, saved > 0.5 { SavedLine(amount: saved, symbol: s.symbol).padding(.top, 10) }
                if !s.bought {
                    LilacHeading("Как собрать")
                    VStack(spacing: 12) {
                        ForEach(s.ways) { way in
                            WayCardView(way: way, symbol: s.symbol,
                                        toggle: { ways = Picks(s.picks).toggled(way.id).text },
                                        give: { amount in ways = Picks(s.picks).giving(amount, to: way.id).text })
                        }
                    }
                }
                if !s.steps.isEmpty {
                    LilacHeading("Как получится")
                    PlanSteps(screen: s)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .safeAreaInset(edge: .bottom) {
            Gathered(screen: s, busy: busy, choose: { post("wishes/\(s.wish.id)/ways", ["ways": s.picks]) { ways = nil } },
                     relay: { relay in post("wishes/\(s.wish.id)/ways", ["ways": relay.ways]) { ways = nil } },
                     unchoose: { post("wishes/\(s.wish.id)/ways/delete", [:]) { ways = nil } })
        }
        .errorAlert($error)
    }

    private func post(_ path: String, _ form: [String: String], then done: @escaping () -> Void = {}) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await session.send(path, form)
                done()
            } catch { self.error = error.localizedDescription }
        }
    }
}

/// «Нужно» with the day the wish is needed by, to pick.
struct DueLine: View {
    let screen: WishScreen
    let change: (String) -> Void

    var body: some View {
        let due = Dates.date(screen.wish.due) ?? Date()
        let from = Dates.date(screen.dueRange.from) ?? Date()
        let to = Dates.date(screen.dueRange.to) ?? Date()
        HStack(spacing: 10) {
            Image(systemName: "flag").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.accent)
            Text("Нужно").font(.body)
            Spacer()
            DatePicker("", selection: Binding(get: { due }, set: { change(Dates.text($0)) }), in: from...to, displayedComponents: .date)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "ru_RU"))
                .opacity(screen.wish.dueSet ? 1 : 0.55)
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
    }
}

/// What expenses set aside for the wish, under its day.
struct SavedLine: View {
    let amount: Double
    let symbol: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: Icons.symbol("piggy")).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.color("green"))
            Text("Отложено").font(.body)
            Spacer()
            Text(Money.text(amount, symbol)).font(.body.weight(.semibold)).monospacedDigit()
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
    }
}

/// The ways picked, in the order picked, each with what it is given by hand or nothing for what the others leave.
struct Picks {
    var items: [(id: String, amount: String)]

    init(_ text: String) {
        items = text.split(separator: ",").map { item in
            let pair = item.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            return (String(pair[0]), pair.count > 1 ? String(pair[1]) : "")
        }
    }

    var text: String { items.map { "\($0.id):\($0.amount)" }.joined(separator: ",") }

    /// Picked, it takes what the others leave; picked again, it is put back.
    func toggled(_ id: String) -> Picks {
        var copy = self
        if items.contains(where: { $0.id == id }) { copy.items.removeAll { $0.id == id } } else { copy.items.append((id, "")) }
        return copy
    }

    func giving(_ amount: Double, to id: String) -> Picks {
        var copy = self
        copy.items = items.map { $0.id == id ? (id, String(Int(amount.rounded()))) : $0 }
        return copy
    }
}

/// A way as a card: tapped, it is picked or put back; picked, a slider sets what it gives.
struct WayCardView: View {
    let way: WayCard
    let symbol: String
    let toggle: () -> Void
    let give: (Double) -> Void
    /// What the slider shows while it is moved, until the server answers.
    @State private var moving: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: toggle) {
                HStack(spacing: 12) {
                    Image(systemName: Icons.symbol(way.icon))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.color(way.color))
                        .frame(width: 40, height: 40)
                        .background(Palette.color(way.color).opacity(0.16), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Text(way.title).font(.headline).multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: way.on ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 24))
                        .foregroundStyle(way.on ? Lilac.accent : Lilac.muted.opacity(0.5))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("way-\(way.id)")
            .accessibilityAddTraits(way.on ? .isSelected : [])
            if way.on {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    LilacAmount(amount: moving ?? way.amount, symbol: symbol, size: 28).fixedSize()
                    if let unit = way.unit { Text(unit).font(.subheadline).foregroundStyle(Lilac.muted) }
                    Spacer()
                    if !way.fixed { Text("остальное").font(.footnote.weight(.semibold)).foregroundStyle(Lilac.accent) }
                }
            }
            Text(way.line).font(.subheadline).foregroundStyle(way.late ? Palette.color("orange") : Lilac.muted)
                .fixedSize(horizontal: false, vertical: true)
            if way.on, way.most > 0.5 {
                Slider(value: Binding(get: { min(moving ?? way.amount, way.most) }, set: { moving = snapped($0) }), in: 0...way.most) { editing in
                    if !editing, let moving { give(moving) }
                }
                .tint(Palette.color(way.color))
                .accessibilityIdentifier("slider-\(way.id)")
            }
        }
        .padding(16)
        .background(way.on ? Lilac.surface : Lilac.surface.opacity(0.55), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay { if way.on { RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Lilac.accent.opacity(0.35), lineWidth: 1) } }
        .shadow(color: .black.opacity(way.on ? 0.05 : 0), radius: 8, y: 3)
        .onChange(of: way) { moving = nil }
    }

    /// By whole steps, the top end reached as it is.
    private func snapped(_ value: Double) -> Double {
        value >= way.most - way.step / 2 ? way.most : (value / way.step).rounded() * way.step
    }
}

/// The plan's steps by date, a line at this week between what is behind and what is ahead, then the buying itself.
struct PlanSteps: View {
    let screen: WishScreen

    var body: some View {
        let past = screen.steps.filter { $0.date <= screen.current }
        let ahead = screen.steps.filter { $0.date > screen.current }
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(past.enumerated()), id: \.element.id) { index, step in row(step, first: index == 0) }
            if !past.isEmpty, !ahead.isEmpty { LilacTodayLine(text: "Сейчас") }
            ForEach(Array(ahead.enumerated()), id: \.element.id) { index, step in row(step, first: index == 0) }
            LilacRow(marker: .symbol("gift", screen.buy.late ? Palette.color("orange") : Lilac.accent), title: screen.bought ? "Куплено" : "Купить",
                     details: screen.buy.label, amount: nil, symbol: screen.symbol, chevron: false)
        }
    }

    private func row(_ step: PlanStep, first: Bool) -> some View {
        LilacRow(marker: .icon(step.row), title: step.row.title, details: step.row.details, amount: step.row.amount, symbol: screen.symbol,
                 first: first, chevron: false)
    }
}

/// What the ways picked gather, kept at the bottom, with the choice.
struct Gathered: View {
    let screen: WishScreen
    let busy: Bool
    let choose: () -> Void
    /// Chooses the chosen plan's ways again, starting from what is set aside.
    let relay: (WishRelay) -> Void
    let unchoose: () -> Void

    var body: some View {
        let s = screen
        let picked = s.ways.contains { $0.on }
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Собрано").font(.subheadline).foregroundStyle(Lilac.muted)
                Spacer()
                Text("\(Money.number(s.covered)) из \(Money.text(s.wish.amount, s.symbol))")
                    .font(.headline.monospacedDigit())
                    .contentTransition(.numericText(value: s.covered))
            }
            GatheredBar(total: s.wish.amount, covered: s.covered, parts: s.ways.filter { $0.on }.map { GatheredBar.Part(amount: $0.given, color: $0.color) })
            if s.short > 0.5, picked || s.chosen {
                Text("Не хватает \(Money.text(s.short, s.symbol))").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.red)
            }
            if s.bought {
                Label("Куплено", systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.accent)
            } else if s.chosen {
                if let r = s.relay, r.add {
                    LilacPrimaryButton(label: r.label, busy: busy) { relay(r) }.accessibilityIdentifier("wish-relay")
                }
                HStack {
                    Label("Выбрано", systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.accent)
                    Spacer()
                    if let r = s.relay, !r.add { LilacInlineAction(label: r.label) { relay(r) } }
                    LilacInlineAction(label: "Отменить", action: unchoose)
                }
            } else if picked {
                LilacPrimaryButton(label: "Выбрать", busy: busy, action: choose)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 8)
        .background {
            Rectangle().fill(Lilac.surface).shadow(color: .black.opacity(0.08), radius: 12, y: -2).ignoresSafeArea(edges: .bottom)
        }
        .animation(.snappy, value: s.covered)
    }
}

/// The wish's amount as a track, each way a part of it in its colour; the chosen plan's money before the ways picked now
/// shows violet first.
struct GatheredBar: View {
    struct Part: Hashable {
        let amount: Double
        let color: String
    }

    let total: Double
    let covered: Double
    let parts: [Part]

    var body: some View {
        let parts = parts.filter { $0.amount > 0.5 }
        let kept = max(0, covered - parts.reduce(0) { $0 + $1.amount })
        GeometryReader { geometry in
            let count = parts.count + (kept > 0.5 ? 1 : 0)
            let width = geometry.size.width - CGFloat(max(count - 1, 0)) * 3
            let share = { (amount: Double) in max(width * min(amount / max(total, 1), 1), 8) }
            HStack(spacing: 3) {
                if kept > 0.5 { Capsule().fill(Lilac.accent.opacity(0.45)).frame(width: share(kept)) }
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in Capsule().fill(Palette.color(part.color)).frame(width: share(part.amount)) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 12)
        .background(Lilac.track, in: Capsule())
    }
}
