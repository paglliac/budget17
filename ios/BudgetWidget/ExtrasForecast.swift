import SwiftUI
import WidgetKit

// The extras' widget after the pictures the user sent on 2026-10-13: a helper that says where this month's extras are
// headed — «Есть запас», «Спокойно», «Впритык» or «Нужно сократить» — with what will likely be set aside or how short
// the plan leaves them, what is left now on a wallet chip, the line of what the month has set aside, and a little ghost
// who is glad, calm, thoughtful or worried with it. The state comes from the server; the face only picks its colours.

/// How a state of the extras looks: violet while there is enough, amber when it is tight, red when short.
struct OutlookTone {
    let state: String

    static let amber = Color(light: 0xF5A000, dark: 0xFFB429)
    static let red = Color(light: 0xF0365C, dark: 0xFF5C77)

    var tight: Bool { state == "tight" }
    var short: Bool { state == "short" }

    /// The figure, the end of the line and the strokes of the bursts.
    var accent: Color { tight ? Self.amber : short ? Self.red : Lilac.accent }
    /// The line of what is set aside: violet but when short.
    var line: Color { short ? Self.red : Lilac.accent }
    /// The ground of the badge.
    var halo: Color {
        tight ? Color(light: 0xFFF1D2, dark: 0x3B2D10) : short ? Color(light: 0xFFE2E8, dark: 0x3F1620) : Color(light: 0xF1EDFF, dark: 0x2B2650)
    }
    /// What the light of the card leans to.
    var wash: Color { short ? Color(light: 0xFCEDF2, dark: 0x2A1820) : Color(light: 0xF0ECFD, dark: 0x211E36) }
    var icon: String { tight || short ? "exclamationmark.triangle.fill" : "sparkle" }

    var mood: Ghost.Mood {
        switch state {
        case "plenty": .glad
        case "tight": .thoughtful
        case "short": .worried
        default: .calm
        }
    }
}

/// The words under the title: muted, with the figure in the state's colour.
private let leadColor = Color(light: 0x7D7997, dark: 0xA5A1BD)

/// The medium widget as the pictures draw it: the badge, «Финансовый помощник» and «Прогноз ›» on top, the title large
/// with a burst after it, its sentence and figure, the wallet chip at the bottom, and the ghost on the line at the right.
struct ExtrasForecastFace: View {
    let forecast: WidgetData.Forecast
    let symbol: String

    var body: some View {
        let tone = OutlookTone(state: forecast.state)
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            ZStack(alignment: .topLeading) {
                // Below the sentence, which reaches past the middle; the ghost stands on it at the right.
                Ghost(mood: tone.mood, tone: tone)
                    .frame(width: height * 0.5, height: height * 0.6)
                    .position(x: width * (tone.short ? 0.8 : 0.74), y: height * 0.52)
                ForecastLine(points: forecast.path, tone: tone)
                    .frame(width: width * 0.58, height: height * 0.42)
                    .position(x: width * 0.71, y: height * 0.79)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 8) {
                        OutlookBadge(tone: tone, size: 24)
                        Text(forecast.label).font(.system(size: 11.5, weight: .medium)).foregroundStyle(leadColor).lineLimit(1)
                        Spacer(minLength: 4)
                        ActionPill(label: forecast.action)
                    }
                    OutlookTitle(title: forecast.title, tone: tone, size: 25).padding(.top, 3)
                    (Text("\(forecast.lead) ") + Text(forecast.figure).fontWeight(.bold).foregroundColor(tone.accent))
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(leadColor)
                        .lineLimit(3)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(width: width * 0.63, alignment: .leading)
                    Spacer(minLength: 2)
                    WalletChip(left: forecast.left, symbol: symbol)
                }
            }
        }
    }
}

/// The small widget: the badge with the ghost beside it, the title, the figure in a word, and the wallet chip.
struct ExtrasForecastSmallFace: View {
    let forecast: WidgetData.Forecast
    let symbol: String

    var body: some View {
        let tone = OutlookTone(state: forecast.state)
        ZStack(alignment: .topTrailing) {
            Ghost(mood: tone.mood, tone: tone)
                .frame(width: 58, height: 66)
                .offset(x: 6, y: -8)
            VStack(alignment: .leading, spacing: 0) {
                OutlookBadge(tone: tone, size: 26)
                Spacer(minLength: 4)
                OutlookTitle(title: forecast.title, tone: tone, size: 20, burst: false)
                (Text("\(forecast.brief) ") + Text(forecast.figure).fontWeight(.bold).foregroundColor(tone.accent))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(leadColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 2)
                WalletChip(left: forecast.left, symbol: symbol, compact: true).padding(.top, 8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// The state on a round badge: a violet sparkle while there is enough, an amber or a red warning otherwise.
struct OutlookBadge: View {
    let tone: OutlookTone
    let size: CGFloat

    var body: some View {
        Image(systemName: tone.icon)
            .font(.system(size: size * 0.46, weight: .bold))
            .symbolRenderingMode(.palette)
            .foregroundStyle(tone.icon == "sparkle" ? tone.accent : .white, tone.accent)
            .frame(width: size, height: size)
            .background(Circle().fill(tone.halo).shadow(color: tone.accent.opacity(0.22), radius: 4, y: 2))
            .widgetAccentable()
    }
}

/// «Есть запас» large and heavy, with the burst of the pictures after it.
struct OutlookTitle: View {
    let title: String
    let tone: OutlookTone
    let size: CGFloat
    var burst = true

    var body: some View {
        Text(title)
            .font(.system(size: size, weight: .heavy))
            .tracking(-0.4)
            .foregroundStyle(Color.primary)
            .lineLimit(burst ? 1 : 2)
            .minimumScaleFactor(0.7)
            .overlay(alignment: .topTrailing) {
                if burst {
                    Burst(color: tone.accent).frame(width: size * 0.62, height: size * 0.62).offset(x: size * 0.6, y: -size * 0.22)
                }
            }
    }
}

/// «Прогноз ›» on a lilac pill.
struct ActionPill: View {
    let label: String

    var body: some View {
        HStack(spacing: 3) {
            Text(label).font(.system(size: 12, weight: .semibold))
            Image(systemName: "chevron.right").font(.system(size: 9, weight: .heavy))
        }
        .foregroundStyle(Color(light: 0x4B4670, dark: 0xC9C4E8))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Lilac.tint, in: Capsule())
    }
}

/// What is left of the extras now on a chip with the wallet: «82 384 ₽ осталось», red when spent past them.
struct WalletChip: View {
    let left: WidgetData.Forecast.Left
    let symbol: String
    var compact = false

    var body: some View {
        if compact {
            // The small widget has no room for the chip around it, nor for «осталось» after a long figure.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    wallet(size: 11)
                    amount(size: 12.5)
                    Text(left.note).font(.system(size: 10, weight: .medium)).foregroundStyle(leadColor).fixedSize()
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    wallet(size: 11)
                    amount(size: 12.5)
                }
            }
        } else {
            HStack(spacing: 8) {
                wallet(size: 16)
                VStack(alignment: .leading, spacing: -1) {
                    amount(size: 14)
                    Text(left.note).font(.system(size: 9.5, weight: .medium)).foregroundStyle(leadColor).lineLimit(1)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Lilac.tint.opacity(0.75), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func wallet(size: CGFloat) -> some View {
        Image(systemName: "\(LilacSymbol.wallet).fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(Color(light: 0x9B8BE6, dark: 0x8F7CFF))
    }

    private func amount(size: CGFloat) -> some View {
        Text(Money.text(left.amount, symbol))
            .font(.system(size: size, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(left.over ? OutlookTone.red : Color.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// Three short strokes flying off a corner, as the pictures draw joy or alarm.
struct Burst: View {
    let color: Color

    var body: some View {
        GeometryReader { geometry in
            let side = geometry.size.width
            Path { path in
                let origin = CGPoint(x: 0, y: side)
                for degrees in [-78.0, -42.0, -8.0] {
                    let angle = degrees * .pi / 180
                    path.move(to: CGPoint(x: origin.x + cos(angle) * side * 0.42, y: origin.y + sin(angle) * side * 0.42))
                    path.addLine(to: CGPoint(x: origin.x + cos(angle) * side * 0.95, y: origin.y + sin(angle) * side * 0.95))
                }
            }
            .stroke(color.opacity(0.85), style: StrokeStyle(lineWidth: side * 0.15, lineCap: .round))
        }
    }
}

/// What the month's extras set aside, from its first day to its end: a soft band under a smooth line, a dot at the end
/// of every week with a dashed line under it, and the month's end large in the state's colour.
struct ForecastLine: View {
    let points: [WidgetData.Forecast.Point]
    let tone: OutlookTone

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let spots = place(in: size)
            if let last = spots.last {
                ZStack {
                    band(spots, size).fill(LinearGradient(colors: [tone.line.opacity(0.16), tone.line.opacity(0)], startPoint: .top, endPoint: .bottom))
                    Path { path in
                        for (index, spot) in spots.enumerated() where points[index].week {
                            path.move(to: CGPoint(x: spot.x, y: index == spots.count - 1 ? 0 : spot.y + 4))
                            path.addLine(to: CGPoint(x: spot.x, y: size.height))
                        }
                    }
                    .stroke(tone.line.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [2.5, 3]))
                    curve(spots).stroke(tone.line.opacity(0.2), lineWidth: 7).blur(radius: 3)
                    curve(spots).stroke(
                        LinearGradient(colors: [tone.line.opacity(0.4), tone.line], startPoint: .leading, endPoint: .trailing),
                        style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round)
                    )
                    ForEach(Array(spots.enumerated()), id: \.offset) { index, spot in
                        if points[index].week && index < spots.count - 1 {
                            Circle()
                                .fill(tone.line)
                                .frame(width: 7, height: 7)
                                .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                                .shadow(color: tone.line.opacity(0.3), radius: 2)
                                .position(spot)
                        }
                    }
                    ZStack {
                        Circle().fill(tone.accent.opacity(0.14)).frame(width: 26, height: 26)
                        Circle().fill(Color.white).frame(width: 15, height: 15).shadow(color: tone.accent.opacity(0.35), radius: 3)
                        Circle().fill(tone.accent).frame(width: 11, height: 11)
                    }
                    .position(last)
                    .widgetAccentable()
                }
            }
        }
    }

    /// The points in the frame: the month across it, room for the end's dot at the right, the highest at the top.
    private func place(in size: CGSize) -> [CGPoint] {
        let amounts = points.map(\.amount)
        guard let low = amounts.min(), let high = amounts.max() else { return [] }
        let span = max(high - low, 1)
        let top: CGFloat = 13
        let bottom = size.height * 0.14
        let right: CGFloat = 13
        return points.map { point in
            CGPoint(
                x: CGFloat(point.share) * (size.width - right),
                y: top + CGFloat((high - point.amount) / span) * (size.height - top - bottom)
            )
        }
    }

    /// A smooth line through the points, each bend shaped by its neighbours.
    private func curve(_ spots: [CGPoint]) -> Path {
        Path { path in
            guard let first = spots.first else { return }
            path.move(to: first)
            for index in 1..<max(spots.count, 1) where index < spots.count {
                let before = spots[max(index - 2, 0)]
                let from = spots[index - 1]
                let to = spots[index]
                let after = spots[min(index + 1, spots.count - 1)]
                path.addCurve(
                    to: to,
                    control1: CGPoint(x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6),
                    control2: CGPoint(x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6)
                )
            }
        }
    }

    private func band(_ spots: [CGPoint], _ size: CGSize) -> Path {
        var path = curve(spots)
        if let first = spots.first, let last = spots.last {
            path.addLine(to: CGPoint(x: last.x, y: size.height))
            path.addLine(to: CGPoint(x: first.x, y: size.height))
            path.closeSubpath()
        }
        return path
    }
}

/// The little ghost of the pictures: a soft lilac body that fades out below, with arms and a face for its mood — glad
/// and waving, calm, thoughtful with a hand at its chin, worried with its hands on its cheeks — and a burst over it.
struct Ghost: View {
    enum Mood { case glad, calm, thoughtful, worried }

    let mood: Mood
    let tone: OutlookTone

    private static let skin = LinearGradient(
        colors: [Color(rgb: 0xFBFAFF), Color(rgb: 0xE6DFFD), Color(rgb: 0xCBBEF7)],
        startPoint: .top,
        endPoint: .bottom
    )
    private static let ink = Color(rgb: 0x2D2766)

    var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            ZStack(alignment: .topLeading) {
                ForEach(Array(arms.enumerated()), id: \.offset) { _, arm in
                    if !arm.front { limb(arm, w) }
                }
                figure(w)
                face(w)
                ForEach(Array(arms.enumerated()), id: \.offset) { _, arm in
                    if arm.front { limb(arm, w) }
                }
                Burst(color: tone.accent)
                    .frame(width: w * 0.3, height: w * 0.3)
                    .position(x: w * 0.9, y: w * 0.04)
            }
            .frame(width: w, height: geometry.size.height, alignment: .topLeading)
        }
    }

    private func figure(_ w: CGFloat) -> some View {
        let shape = GhostShape()
        return shape
            .fill(Self.skin)
            .overlay(shape.fill(RadialGradient(colors: [.white.opacity(0.95), .white.opacity(0)], center: UnitPoint(x: 0.36, y: 0.16), startRadius: 0, endRadius: w * 0.42)))
            .overlay(shape.fill(LinearGradient(colors: [.clear, Lilac.accent.opacity(0.1)], startPoint: .leading, endPoint: .trailing)))
            .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.6), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
            .shadow(color: Lilac.accent.opacity(0.2), radius: w * 0.07, y: w * 0.03)
    }

    /// An arm: where its middle is, its size and turn, all in widths of the ghost, and whether it is before the body.
    private struct Arm {
        let x, y, width, height, degrees: CGFloat
        var front = false
    }

    private var arms: [Arm] {
        switch mood {
        case .glad: [Arm(x: 0.09, y: 0.78, width: 0.17, height: 0.3, degrees: -38), Arm(x: 0.92, y: 0.4, width: 0.19, height: 0.36, degrees: 26)]
        case .calm: [Arm(x: 0.08, y: 0.76, width: 0.17, height: 0.3, degrees: -45), Arm(x: 0.94, y: 0.62, width: 0.17, height: 0.32, degrees: 48)]
        case .thoughtful: [Arm(x: 0.1, y: 0.8, width: 0.16, height: 0.28, degrees: -22), Arm(x: 0.63, y: 0.76, width: 0.2, height: 0.16, degrees: -18, front: true)]
        case .worried:
            [Arm(x: 0.21, y: 0.58, width: 0.17, height: 0.24, degrees: 18, front: true), Arm(x: 0.79, y: 0.58, width: 0.17, height: 0.24, degrees: -18, front: true)]
        }
    }

    private func limb(_ arm: Arm, _ w: CGFloat) -> some View {
        Ellipse()
            .fill(Self.skin)
            .overlay(Ellipse().fill(RadialGradient(colors: [.white.opacity(0.8), .white.opacity(0)], center: UnitPoint(x: 0.35, y: 0.25), startRadius: 0, endRadius: w * 0.14)))
            .frame(width: w * arm.width, height: w * arm.height)
            .shadow(color: Lilac.accent.opacity(arm.front ? 0.22 : 0.12), radius: w * 0.03, y: w * 0.015)
            .rotationEffect(.degrees(arm.degrees))
            .position(x: w * arm.x, y: w * arm.y)
    }

    @ViewBuilder
    private func face(_ w: CGFloat) -> some View {
        let line = StrokeStyle(lineWidth: w * 0.036, lineCap: .round, lineJoin: .round)
        switch mood {
        case .glad, .calm:
            ZStack(alignment: .topLeading) {
                ForEach([0.29, 0.71], id: \.self) { x in
                    Circle().fill(Color(rgb: 0xF7A8C8).opacity(0.35)).frame(width: w * 0.1, height: w * 0.07).position(x: w * x, y: w * 0.5)
                }
                Path { path in
                    for x in [0.37, 0.63] {
                        path.move(to: CGPoint(x: w * (x - 0.06), y: w * 0.42))
                        path.addQuadCurve(to: CGPoint(x: w * (x + 0.06), y: w * 0.42), control: CGPoint(x: w * x, y: w * 0.35))
                    }
                    path.move(to: CGPoint(x: w * 0.44, y: w * 0.48))
                    path.addQuadCurve(to: CGPoint(x: w * 0.56, y: w * 0.48), control: CGPoint(x: w * 0.5, y: w * (mood == .glad ? 0.56 : 0.54)))
                }
                .stroke(Self.ink, style: line)
            }
        case .thoughtful:
            ZStack(alignment: .topLeading) {
                eye(x: 0.4, y: 0.4, w)
                eye(x: 0.61, y: 0.38, w)
                Path { path in
                    path.move(to: CGPoint(x: w * 0.47, y: w * 0.53))
                    path.addLine(to: CGPoint(x: w * 0.55, y: w * 0.51))
                }
                .stroke(Self.ink, style: line)
            }
        case .worried:
            ZStack(alignment: .topLeading) {
                eye(x: 0.41, y: 0.43, w)
                eye(x: 0.6, y: 0.43, w)
                Path { path in
                    path.move(to: CGPoint(x: w * 0.33, y: w * 0.36))
                    path.addLine(to: CGPoint(x: w * 0.44, y: w * 0.32))
                    path.move(to: CGPoint(x: w * 0.57, y: w * 0.32))
                    path.addLine(to: CGPoint(x: w * 0.68, y: w * 0.36))
                    path.move(to: CGPoint(x: w * 0.44, y: w * 0.56))
                    path.addQuadCurve(to: CGPoint(x: w * 0.57, y: w * 0.56), control: CGPoint(x: w * 0.5, y: w * 0.5))
                }
                .stroke(Self.ink, style: line)
            }
        }
    }

    private func eye(x: CGFloat, y: CGFloat, _ w: CGFloat) -> some View {
        Ellipse().fill(Self.ink).frame(width: w * 0.07, height: w * 0.09).position(x: w * x, y: w * y)
    }
}

/// The ghost's outline: a round head, sides that widen a little down to a broad bottom, which the face fades out.
struct GhostShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let radius = w * 0.36
        let center = CGPoint(x: rect.minX + w * 0.5, y: rect.minY + w * 0.4)
        let k = radius * 0.5523
        let left = CGPoint(x: center.x - radius, y: center.y)
        let right = CGPoint(x: center.x + radius, y: center.y)
        let top = CGPoint(x: center.x, y: center.y - radius)
        let bottomLeft = CGPoint(x: rect.minX + w * 0.04, y: rect.maxY)
        let bottomRight = CGPoint(x: rect.maxX - w * 0.04, y: rect.maxY)
        var path = Path()
        path.move(to: left)
        path.addCurve(to: top, control1: CGPoint(x: left.x, y: center.y - k), control2: CGPoint(x: center.x - k, y: top.y))
        path.addCurve(to: right, control1: CGPoint(x: center.x + k, y: top.y), control2: CGPoint(x: right.x, y: center.y - k))
        path.addCurve(
            to: bottomRight,
            control1: CGPoint(x: right.x, y: center.y + radius * 0.9),
            control2: CGPoint(x: rect.maxX - w * 0.08, y: rect.maxY - rect.height * 0.15)
        )
        path.addLine(to: bottomLeft)
        path.addCurve(
            to: left,
            control1: CGPoint(x: rect.minX + w * 0.08, y: rect.maxY - rect.height * 0.15),
            control2: CGPoint(x: left.x, y: center.y + radius * 0.9)
        )
        path.closeSubpath()
        return path
    }
}

/// The card's light: white leaning to lilac, or to pink when short, and a glow under the line.
struct ExtrasBackdrop: View {
    let tone: OutlookTone

    var body: some View {
        ZStack {
            Lilac.surface
            LinearGradient(colors: [Lilac.surface.opacity(0), tone.wash], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [tone.line.opacity(0.12), tone.line.opacity(0)], center: UnitPoint(x: 0.75, y: 0.9), startRadius: 0, endRadius: 170)
        }
    }
}
