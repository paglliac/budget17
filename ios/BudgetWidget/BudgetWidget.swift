import AppIntents
import SwiftUI
import WidgetKit

// The widgets in the app's lilac look, after the reference the user sent on 2026-10-09: the week, with what is left of
// it and its days; today, with what was spent and the expenses that wait for a category in a ring; what this month
// saved, with the months before it; the next regular payment. On the Lock Screen each is a card: an icon on a tile, a
// figure or a title, and a line under it. They read /api/widget from the server the app signed in to, through the
// Keychain they share, every 15 minutes, as often as iOS lets it, and whenever the app changes something; offline they
// show what they read last, quieter.

@main
struct BudgetWidgets: WidgetBundle {
    var body: some Widget {
        WeekWidget()
        TodayWidget()
        SavingsWidget()
        PaymentWidget()
    }
}

/// Which widget a face belongs to. The week keeps the kind of the app's first widget, so one already placed stays.
enum WidgetKind: String {
    case week = "budget"
    case today
    case savings
    case payment

    /// Where a tap on the widget leads in the app.
    var link: URL {
        switch self {
        case .week, .today: WidgetLink.week
        case .savings: WidgetLink.operations
        case .payment: WidgetLink.regular
        }
    }
}

/// Where a tap leads: the week, the expenses to sort, the operations, the regular payments.
enum WidgetLink {
    static let week = URL(string: "budget://week")!
    static let sort = URL(string: "budget://sort")!
    static let operations = URL(string: "budget://operations")!
    static let regular = URL(string: "budget://regular")!
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKind.week.rawValue, provider: Provider()) { WidgetView(entry: $0, kind: .week) }
            .configurationDisplayName("Неделя")
            .description("Сколько свободно до конца недели.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKind.today.rawValue, provider: Provider()) { WidgetView(entry: $0, kind: .today) }
            .configurationDisplayName("Сегодня")
            .description("Сколько потрачено сегодня и сколько трат ждут разбора.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct SavingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKind.savings.rawValue, provider: Provider()) { WidgetView(entry: $0, kind: .savings) }
            .configurationDisplayName("Накопления")
            .description("Насколько доходы месяца больше расходов.")
            .supportedFamilies([.systemSmall])
    }
}

struct PaymentWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKind.payment.rawValue, provider: Provider()) { WidgetView(entry: $0, kind: .payment) }
            .configurationDisplayName("Ближайший платёж")
            .description("Какой регулярный платёж следующий.")
            .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct Entry: TimelineEntry {
    let date: Date
    /// nil until the app has signed in to a server.
    let data: WidgetData?
    /// Read earlier, as the server could not be reached.
    var stale = false
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, data: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await Loader.entry()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Task {
            let entry = await Loader.entry()
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
        }
    }
}

/// Reads /api/widget from the app's server, keeping the last answer for when the server cannot be reached.
enum Loader {
    private static let cacheKey = "widget"

    static func entry() async -> Entry {
        guard let request = request("widget") else { return Entry(date: .now, data: nil) }
        do {
            let (body, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let data = try JSONDecoder().decode(WidgetData.self, from: body)
            UserDefaults.standard.set(body, forKey: cacheKey)
            return Entry(date: .now, data: data)
        } catch {
            let cached = UserDefaults.standard.data(forKey: cacheKey).flatMap { try? JSONDecoder().decode(WidgetData.self, from: $0) }
            return Entry(date: .now, data: cached, stale: cached != nil)
        }
    }

    /// Asks the server to fetch what ZenMoney has new, as the app does when it opens; a sync waits for ZenMoney.
    static func sync() async {
        guard var request = request("sync") else { return }
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        _ = try? await URLSession.shared.data(for: request)
    }

    private static func request(_ path: String) -> URLRequest? {
        let address = Keychain.read(Keychain.server)
        guard !address.isEmpty, let base = URL(string: address) else { return nil }
        var request = URLRequest(url: base.appending(path: "api").appending(path: path), timeoutInterval: 20)
        let token = Keychain.read(Keychain.token)
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }
}

/// «Обновлено 18:42» pressed: the server syncs with ZenMoney, and every widget reads it again.
struct SyncIntent: AppIntent {
    static let title: LocalizedStringResource = "Обновить из ZenMoney"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await Loader.sync()
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct WidgetView: View {
    let entry: Entry
    let kind: WidgetKind
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetContent(entry: entry, kind: kind, family: family)
    }
}

/// A widget's face for its kind and size, apart from WidgetKit's environment so that it can be drawn on its own.
struct WidgetContent: View {
    let entry: Entry
    let kind: WidgetKind
    let family: WidgetFamily

    var body: some View {
        Group {
            if let data = entry.data {
                face(data)
            } else {
                signedOut
            }
        }
        .opacity(entry.stale ? 0.6 : 1)
        .containerBackground(for: .widget) {
            if lockScreen {
                Color.clear
            } else {
                WidgetBackground(glow: kind == .week)
            }
        }
        .widgetURL(kind.link)
    }

    private var lockScreen: Bool {
        [.accessoryRectangular, .accessoryInline, .accessoryCircular].contains(family)
    }

    @ViewBuilder
    private func face(_ data: WidgetData) -> some View {
        switch (kind, family) {
        case (.week, .accessoryInline):
            Label(Money.text(data.week.free, data.symbol), systemImage: "rublesign.circle")
        case (.week, .accessoryRectangular):
            LockCard(icon: "rublesign", title: Money.text(data.week.free, data.symbol), note: data.week.note)
        case (.week, _):
            WeekFace(data: data, wide: family == .systemMedium)
        case (.today, .accessoryRectangular):
            LockCard(icon: data.pending.count == 0 ? "checkmark" : "tray.full", title: data.pending.title, note: data.pending.note)
        case (.today, .systemMedium):
            TodayFace(data: data)
        case (.today, _):
            TodaySmallFace(data: data)
        case (.savings, _):
            SavingsFace(data: data)
        case (.payment, .accessoryRectangular):
            if let payment = data.payment {
                LockCard(icon: "calendar", title: payment.title, note: "\(Money.text(payment.amount, data.symbol)) · \(payment.when)")
            } else {
                LockCard(icon: "calendar", title: "—", note: "")
            }
        case (.payment, _):
            PaymentFace(payment: data.payment, symbol: data.symbol)
        }
    }

    @ViewBuilder
    private var signedOut: some View {
        if lockScreen {
            LockCard(icon: "rublesign", title: "Бюджет", note: "Войдите в приложении")
        } else {
            VStack(alignment: .leading, spacing: 4) {
                IconTile(icon: "rublesign")
                Spacer()
                Text("Войдите в приложении").font(.footnote.weight(.medium))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// White, as the app's cards; the week's has the soft lilac light of the reference in its corner.
struct WidgetBackground: View {
    let glow: Bool

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            ZStack {
                Lilac.surface
                if glow {
                    Ellipse()
                        .fill(LinearGradient(colors: [Lilac.tint.opacity(0.7), Lilac.soft.opacity(0.8)], startPoint: .topLeading, endPoint: .trailing))
                        .overlay(Ellipse().strokeBorder(Lilac.lensTop, lineWidth: 2).blur(radius: 0.6))
                        .frame(width: size.width * 0.62, height: size.height * 1.45)
                        .rotationEffect(.degrees(-22))
                        .position(x: size.width * 0.84, y: size.height * 0.02)
                        .blur(radius: 2.5)
                }
            }
        }
    }
}

/// A figure in the heavy face, ₽ as heavy as its digits; red when it is below zero.
struct WidgetAmount: View {
    let amount: Double
    let symbol: String
    let size: CGFloat

    var body: some View {
        Text(Money.text(amount, symbol))
            .font(.system(size: size, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(amount < -0.5 ? Lilac.red : Color.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .contentTransition(.numericText(value: amount))
    }
}

/// An icon on a lilac tile, as the reference's cards begin.
struct IconTile: View {
    let icon: String
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(Lilac.accent)
            .frame(width: size, height: size)
            .background(Lilac.tint, in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .widgetAccentable()
    }
}

/// «Неделя», what is free large, and the days of the week with today on a violet disc; a day with spending has a
/// darker dot.
struct WeekFace: View {
    let data: WidgetData
    let wide: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(data.week.label).font(.subheadline.weight(.medium))
            WidgetAmount(amount: data.week.free, symbol: data.symbol, size: wide ? 36 : 28)
            Text(data.week.note)
                .font(wide ? .subheadline : .caption)
                .foregroundStyle(Lilac.muted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 6)
            DayStrip(days: data.week.days, compact: !wide)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct DayStrip: View {
    let days: [WidgetData.Day]
    let compact: Bool

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                VStack(spacing: compact ? 3 : 4) {
                    Text(day.label)
                        .font(.system(size: compact ? 10 : 12, weight: day.today ? .semibold : .regular))
                        .foregroundStyle(day.today ? Color.primary : Lilac.muted)
                    marker(day).frame(width: compact ? 16 : 24, height: compact ? 16 : 24)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func marker(_ day: WidgetData.Day) -> some View {
        if day.today {
            ZStack {
                Circle().fill(Lilac.accent).shadow(color: Lilac.accent.opacity(0.45), radius: compact ? 3 : 5, y: 1)
                Circle().fill(Color.white).frame(width: compact ? 4 : 6, height: compact ? 4 : 6)
            }
            .widgetAccentable()
        } else {
            Circle()
                .fill(day.spent ? Lilac.muted : Lilac.muted.opacity(0.35))
                .frame(width: compact ? 4 : 6, height: compact ? 4 : 6)
        }
    }
}

/// «Обновлено 18:42»: when the server last fetched from ZenMoney; pressed, it fetches again.
struct SyncedLine: View {
    let synced: Date

    var body: some View {
        Button(intent: SyncIntent()) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.2.circlepath")
                Text("Обновлено \(Dates.moment(synced))").monospacedDigit()
            }
            .font(.footnote)
            .foregroundStyle(Lilac.muted)
        }
        .buttonStyle(.plain)
    }
}

/// «Сегодня потрачено» with when the data came from ZenMoney, and the ring of the expenses that wait for a category.
struct TodayFace: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(data.today.label).font(.subheadline.weight(.medium))
                WidgetAmount(amount: data.today.amount, symbol: data.symbol, size: 32)
                Spacer(minLength: 6)
                if let synced = data.today.synced { SyncedLine(synced: synced) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            Link(destination: WidgetLink.sort) {
                PendingRing(pending: data.pending, size: 126)
            }
        }
    }
}

struct TodaySmallFace: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(data.today.label).font(.footnote.weight(.medium))
            WidgetAmount(amount: data.today.amount, symbol: data.symbol, size: 26)
            Spacer(minLength: 6)
            HStack(spacing: 8) {
                PendingRing(pending: data.pending, size: 42, small: true)
                Text(data.pending.label)
                    .font(.caption)
                    .foregroundStyle(Lilac.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// How many expenses wait for a category, in a ring that closes as the month's expenses get theirs; a tick when all
/// have one.
struct PendingRing: View {
    let pending: WidgetData.Pending
    let size: CGFloat
    /// Only the count inside, its words beside the ring.
    var small = false

    var body: some View {
        let line = small ? 4.0 : 9.0
        let share = min(max(pending.sorted, 0.03), 1)
        ZStack {
            Circle().stroke(Lilac.track.opacity(0.7), lineWidth: line)
            Circle()
                .trim(from: 0, to: share)
                .stroke(
                    AngularGradient(colors: [Lilac.accent.opacity(0.85), Lilac.soft.opacity(0.5)], center: .center, startAngle: .zero, endAngle: .degrees(360 * share)),
                    style: StrokeStyle(lineWidth: line, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            VStack(spacing: 2) {
                if pending.count == 0 {
                    Image(systemName: "checkmark")
                        .font(.system(size: size * (small ? 0.36 : 0.2), weight: .bold))
                        .foregroundStyle(Lilac.accent)
                } else {
                    Text("\(pending.count)")
                        .font(.system(size: size * (small ? 0.4 : 0.28), weight: .bold))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                }
                if !small {
                    Text(pending.label)
                        .font(.caption)
                        .foregroundStyle(Lilac.muted)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
            }
            .padding(line + 4)
        }
        .frame(width: size, height: size)
    }
}

/// «Накопления в этом месяце»: income above spending, against the month before, and the months before it as bars.
struct SavingsFace: View {
    let data: WidgetData

    var body: some View {
        let savings = data.savings
        VStack(alignment: .leading, spacing: 0) {
            Text(savings.label).font(.footnote.weight(.medium))
            Text(savings.period).font(.footnote).foregroundStyle(Lilac.muted)
            WidgetAmount(amount: savings.amount, symbol: data.symbol, size: 24).padding(.top, 2)
            if let change = savings.change {
                ChangeLine(change: change).padding(.top, 2)
            }
            Spacer(minLength: 6)
            MonthBars(months: savings.months).frame(height: 36)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// ↗ на 27% больше, чем в прошлом месяце: green when more is saved, red when less.
struct ChangeLine: View {
    let change: WidgetData.Change

    var body: some View {
        let tone = change.direction == "up" ? Palette.color("green") : change.direction == "down" ? Lilac.red : Lilac.muted
        HStack(alignment: .top, spacing: 4) {
            Image(systemName: change.direction == "up" ? "arrow.up.right" : change.direction == "down" ? "arrow.down.right" : "equal")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(tone)
                .frame(width: 14, height: 14)
                .background(tone.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text(change.label).font(.caption2.weight(.medium)).foregroundStyle(Color.primary.opacity(0.75))
                if let note = change.note {
                    Text(note).font(.system(size: 10)).foregroundStyle(Lilac.muted)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
    }
}

/// The months as bars from a line at zero, this month the deepest: up for a month that saved, down for one that did not.
struct MonthBars: View {
    let months: [WidgetData.Month]

    var body: some View {
        GeometryReader { geometry in
            let height = geometry.size.height
            let top = max(months.map(\.amount).max() ?? 0, 0)
            let bottom = max(-(months.map(\.amount).min() ?? 0), 0)
            let span = max(top + bottom, 1)
            let zero = height * top / span
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(months.enumerated()), id: \.offset) { index, month in
                    let bar = max(4, (height - 4) * abs(month.amount) / span)
                    Capsule()
                        .fill(month.amount < 0 ? Lilac.red.opacity(index == months.count - 1 ? 0.8 : 0.3) : color(index))
                        .frame(width: 7, height: bar)
                        .offset(y: month.amount >= 0 ? max(zero - bar, 0) : min(zero, height - bar))
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    /// Lilac deepening towards this month; a month that spent more than it got is a faint red.
    private func color(_ index: Int) -> Color {
        if index == months.count - 1 { return Lilac.accent }
        let position = Double(index + 1) / Double(max(months.count, 1))
        return Lilac.soft.opacity(0.35 + 0.55 * position)
    }
}

/// The next regular payment: what it is, how much and when.
struct PaymentFace: View {
    let payment: WidgetData.Payment?
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            IconTile(icon: "calendar", size: 38)
            Spacer(minLength: 6)
            if let payment {
                Text(payment.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                WidgetAmount(amount: payment.amount, symbol: symbol, size: 22)
                Text("\(payment.date), \(payment.when)").font(.caption).foregroundStyle(Lilac.muted).lineLimit(1).minimumScaleFactor(0.8)
            } else {
                Text("—").font(.title3.weight(.semibold)).foregroundStyle(Lilac.muted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// A Lock Screen card as the reference draws its cards: an icon on a tile, a title or a figure, and a line under it.
struct LockCard: View {
    let icon: String
    let title: String
    let note: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 36, height: 36)
                .background { AccessoryWidgetBackground().clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)) }
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.headline).lineLimit(2).minimumScaleFactor(0.7)
                if !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(2).minimumScaleFactor(0.8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview(as: .systemMedium) {
    WeekWidget()
} timeline: {
    Entry(date: .now, data: .sample)
}

#Preview(as: .systemMedium) {
    TodayWidget()
} timeline: {
    Entry(date: .now, data: .sample)
}

#Preview(as: .systemSmall) {
    SavingsWidget()
} timeline: {
    Entry(date: .now, data: .sample)
}
