import SwiftUI

// The «Желания» tab: every wish in one place, as cards with the ways each one's money comes from, or as the money their
// plans hold by month. A wish opens its page, and its plan can be taken back here.

/// All wishes, switched between the cards and the months; «+» adds one.
struct WishesView: View {
    enum Part: String { case cards, months }

    @AppStorage("wishes-part") private var part = Part.cards
    @State private var sheet: BudgetSheet?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                LilacTitle(text: "Желания") {
                    LilacRoundButton(systemImage: "plus", label: "Добавить желание") { sheet = .wish(nil) }
                }
                LilacSegmented(items: [Segment(value: Part.cards, label: "Карточки"), Segment(value: .months, label: "Месяцы")], selection: $part, width: nil)
                    .accessibilityIdentifier("wishes-part")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 4)
            Screen(path: "wishes") { (s: WishesScreen) in
                ScrollView {
                    Group {
                        switch part {
                        case .cards: WishCards(screen: s, sheet: $sheet)
                        case .months: WishMonths(screen: s, sheet: $sheet)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
        }
        .background(LilacBackground())
        .budgetSheets($sheet)
    }
}

/// A card for each wish.
struct WishCards: View {
    let screen: WishesScreen
    @Binding var sheet: BudgetSheet?

    var body: some View {
        VStack(spacing: 14) {
            ForEach(screen.wishes) { wish in
                WishCard(wish: wish, symbol: screen.symbol) { sheet = .wish(wish.id) }
            }
            if screen.wishes.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
        }
        .padding(.top, 18)
    }
}

/// A wish's card: its name, day and amount, then what its plan gathers, what is set aside and the ways its money comes
/// from and the week it is bought, with «Изменить» and «Отменить план»; a wish without a plan has «Разложить». A plan
/// buying it after its day shows the week orange, one falling short says by how much in red, and choosing its ways again
/// («Добрать», or «Освободить» when more was set aside than planned) is a button of its own.
struct WishCard: View {
    let wish: WishSummary
    let symbol: String
    let open: () -> Void
    @Environment(Session.self) private var session
    @State private var confirmUnchoose = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: open) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(wish.wish.title).font(.headline).multilineTextAlignment(.leading)
                        if !wish.when.isEmpty {
                            Text(wish.when).font(.subheadline).foregroundStyle(wish.situation == "risk" ? Palette.color("orange") : Lilac.muted)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    Spacer(minLength: 8)
                    LilacAmount(amount: wish.wish.amount, symbol: symbol, size: 22).fixedSize()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("wish-card-\(wish.id)")
            switch wish.state {
            case "bought":
                Label(wish.wish.kind == "card" ? "Погашено" : "Куплено", systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.accent)
            case "planned":
                GatheredBar(total: wish.wish.amount, covered: wish.covered, parts: wish.ways.map { GatheredBar.Part(amount: $0.amount, color: $0.color) })
                VStack(spacing: 10) {
                    ForEach(wish.ways) { way in WayLine(way: way, symbol: symbol) }
                }
                if wish.short > 0.5 || wish.relay != nil {
                    // What is short goes with what gathers it, beside it when they fit.
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) { shortfall; Spacer(minLength: 0); relay }
                        VStack(alignment: .leading, spacing: 4) { shortfall; relay }
                    }
                }
                HStack(spacing: 8) {
                    LilacInlineAction(label: "Изменить", action: open)
                    LilacInlineAction(label: "Отменить план") { confirmUnchoose = true }
                    Spacer()
                }
            default:
                ForEach(wish.ways) { way in WayLine(way: way, symbol: symbol) }
                HStack {
                    Text("Не разложено").font(.subheadline).foregroundStyle(Lilac.muted)
                    Spacer()
                    LilacInlineAction(label: "Разложить", action: open)
                }
            }
        }
        .padding(16)
        .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .confirmationDialog("Отменить план «\(wish.wish.title)»?", isPresented: $confirmUnchoose, titleVisibility: .visible) {
            Button("Отменить план", role: .destructive) { send("wishes/\(wish.id)/ways/delete") }
        }
        .errorAlert($error)
    }

    @ViewBuilder private var shortfall: some View {
        if wish.short > 0.5 {
            Text("Не хватает \(Money.text(wish.short, symbol))").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.red).fixedSize()
        }
    }

    @ViewBuilder private var relay: some View {
        if let relay = wish.relay {
            LilacInlineAction(label: relay.label) { send("wishes/\(wish.id)/ways", ["ways": relay.ways]) }
                .fixedSize()
                .accessibilityIdentifier("wish-relay-\(wish.id)")
        }
    }

    private func send(_ path: String, _ form: [String: String] = [:]) {
        Task {
            do { try await session.send(path, form) } catch { self.error = error.localizedDescription }
        }
    }
}

/// A way the chosen plan takes money from: its tile, its name over what it does, and what it gives in all.
struct WayLine: View {
    let way: WishSummary.Way
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: Icons.symbol(way.icon))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.color(way.color))
                .frame(width: 34, height: 34)
                .background(Palette.color(way.color).opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(way.title).font(.subheadline.weight(.semibold))
                Text(way.line).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(Money.text(way.amount, symbol)).font(.subheadline.weight(.semibold)).monospacedDigit().fixedSize()
        }
    }
}

/// The wishes a line each, then what their plans hold by month, each row opening its wish.
struct WishMonths: View {
    let screen: WishesScreen
    @Binding var sheet: BudgetSheet?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(screen.wishes.enumerated()), id: \.element.id) { index, wish in
                WishLine(wish: wish, symbol: screen.symbol, first: index == 0) { sheet = .wish(wish.id) }
            }
            if screen.wishes.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
            ForEach(screen.months) { month in
                LilacHeading(month.title, subtitle: Money.text(month.total, screen.symbol))
                ForEach(Array(month.rows.enumerated()), id: \.element.id) { index, held in
                    Button { sheet = .wish(held.wish) } label: {
                        LilacRow(marker: .icon(held.row), title: held.row.title, details: held.row.details, amount: held.row.amount, symbol: screen.symbol,
                                 first: index == 0)
                    }
                    .buttonStyle(.card)
                }
            }
        }
        .padding(.top, 14)
    }
}

/// A wish's line: its name over its day and plan, its amount; a long press takes the plan back or deletes the wish.
struct WishLine: View {
    let wish: WishSummary
    let symbol: String
    let first: Bool
    let open: () -> Void
    @Environment(Session.self) private var session
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        Button(action: open) {
            LilacRow(marker: .symbol(wish.row.muted ? "checkmark" : Icons.symbol(wish.row.icon), wish.row.muted ? Lilac.muted : Palette.week), title: wish.row.title,
                     details: wish.row.details, amount: wish.row.amount, symbol: symbol, muted: wish.row.muted, first: first)
        }
        .buttonStyle(.card)
        .accessibilityIdentifier("wish-line-\(wish.id)")
        .contextMenu {
            if wish.state == "planned" {
                Button("Отменить план", systemImage: "arrow.uturn.backward") { send("wishes/\(wish.id)/ways/delete") }
            }
            Button("Удалить", systemImage: "trash", role: .destructive) { confirmDelete = true }
        }
        .confirmationDialog("Удалить «\(wish.wish.title)»?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { send("wishes/\(wish.id)/delete") }
        }
        .errorAlert($error)
    }

    private func send(_ path: String) {
        Task {
            do { try await session.send(path) } catch { self.error = error.localizedDescription }
        }
    }
}
