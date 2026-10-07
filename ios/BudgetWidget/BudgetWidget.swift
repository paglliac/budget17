import SwiftUI
import WidgetKit

// The widget: what is left of the current week, and the expenses of this month that still wait for a category. It
// reads the server the app signed in to from the Keychain they share, every 15 minutes, as often as iOS lets it, and whenever the app changes
// something; offline it shows what it read last, quieter.

@main
struct BudgetWidgets: WidgetBundle {
    var body: some Widget {
        BudgetWidget()
    }
}

struct BudgetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "budget", provider: Provider()) { entry in
            WidgetView(entry: entry)
        }
        .configurationDisplayName("Бюджет")
        .description("Сколько ещё можно потратить на этой неделе и сколько трат ждут категории.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
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
        let address = Keychain.read(Keychain.server)
        guard let base = URL(string: address), !address.isEmpty else { return Entry(date: .now, data: nil) }
        var request = URLRequest(url: base.appending(path: "api").appending(path: "widget"), timeoutInterval: 20)
        let token = Keychain.read(Keychain.token)
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
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
}

/// Where a tap on the widget leads: the week, or the expenses to sort.
enum WidgetLink {
    static let week = URL(string: "budget://week")!
    static let sort = URL(string: "budget://sort")!
}

struct WidgetView: View {
    let entry: Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetContent(entry: entry, family: family)
    }
}

/// The widget's face for a size, apart from WidgetKit's environment so that it can be drawn on its own.
struct WidgetContent: View {
    let entry: Entry
    let family: WidgetFamily

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .accessoryInline: inline(data)
                case .accessoryRectangular: rectangular(data)
                case .systemMedium: medium(data)
                default: small(data)
                }
            } else {
                signedOut
            }
        }
        .opacity(entry.stale ? 0.6 : 1)
        .containerBackground(for: .widget) { Color(light: 0xFFFFFF, dark: 0x1C1C1F) }
        .widgetURL(WidgetLink.week)
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "rublesign.circle").font(.title2).foregroundStyle(Palette.extra)
            Spacer()
            Text("Войдите в приложении").font(.footnote.weight(.medium))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// What is left, large, with the week under it and its bar.
    private func left(_ data: WidgetData, size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(data.week).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            Text(Money.text(data.free, data.symbol))
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(data.free < 0 ? Palette.color("red") : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Bar(parts: data.parts).frame(height: 5)
        }
    }

    private func pendingLine(_ data: WidgetData) -> some View {
        HStack(spacing: 5) {
            Image(systemName: data.pending.count == 0 ? "checkmark.circle.fill" : "tag.fill")
            Text(data.pending.count == 0 ? "Всё разобрано" : "Разобрать \(data.pending.count)")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(data.pending.count == 0 ? Palette.color("green") : Palette.extra)
    }

    private func small(_ data: WidgetData) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            left(data, size: 26)
            Text(data.note).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8).padding(.top, 6)
            Spacer(minLength: 8)
            Link(destination: WidgetLink.sort) { pendingLine(data) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ data: WidgetData) -> some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                left(data, size: 30)
                Spacer(minLength: 6)
                Text(data.note).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle().fill(.quaternary).frame(width: 1)
            Link(destination: WidgetLink.sort) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Без категории").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                    Text("\(data.pending.count)")
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .foregroundStyle(data.pending.count == 0 ? Palette.color("green") : Palette.extra)
                    Spacer(minLength: 0)
                    Text(data.pending.count == 0 ? data.pending.note : Money.text(data.pending.amount, data.symbol))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(width: 104, alignment: .leading)
            }
        }
    }

    private func rectangular(_ data: WidgetData) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(Money.text(data.free, data.symbol))
                .font(.headline.monospacedDigit())
                .widgetAccentable()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("свободно на неделе").font(.caption2)
            Text(data.pending.count == 0 ? "всё разобрано" : "разобрать: \(data.pending.count)").font(.caption2.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ data: WidgetData) -> some View {
        Text(data.pending.count == 0 ? Money.text(data.free, data.symbol) : "\(Money.text(data.free, data.symbol)) · разобрать \(data.pending.count)")
    }
}

/// The week's parts as one bar: spent, planned, free.
struct Bar: View {
    let parts: [WidgetData.Part]

    var body: some View {
        let shown = parts.filter { $0.value > 0.5 }
        let sum = shown.reduce(0) { $0 + $1.value }
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(shown, id: \.label) { part in
                    Capsule()
                        .fill(Palette.color(part.tone))
                        .frame(width: max(3, (geometry.size.width - CGFloat(max(shown.count - 1, 0)) * 2) * part.value / max(sum, 1)))
                }
            }
        }
    }
}

#Preview(as: .systemSmall) {
    BudgetWidget()
} timeline: {
    Entry(date: .now, data: .sample)
}

#Preview(as: .systemMedium) {
    BudgetWidget()
} timeline: {
    Entry(date: .now, data: .sample)
}
