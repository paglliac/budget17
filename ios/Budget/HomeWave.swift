import SwiftUI

/// How the wave on the circle stands, after what the server says of the week: its colour and how high it rises.
struct WaveLevel: Equatable {
    let state: String
    let share: Double

    /// A server from before the wave sends no state, and the lens stands without one.
    init(_ free: WeekHome.Free) {
        state = free.state ?? "empty"
        share = free.share ?? 0
    }

    /// From the bottom of the lens, as a share of its height. A little left, or a little past the amount, still shows as
    /// a bowl at the bottom; a full week stays low enough for what is free to fit above it.
    var height: CGFloat {
        switch state {
        case "empty": 0
        case "over": 0.14 + 0.28 * share
        default: 0.12 + 0.32 * share
        }
    }

    var color: Color {
        switch state {
        case "over": Lilac.waveOver
        case "low": Lilac.waveLow
        default: Lilac.wave
        }
    }
}

/// The lilac lens of the circle with the wave on it, cut by the circle. The wave rises from the bottom and drifts slowly
/// sideways; with reduced motion it stands still.
struct WaveLens: View {
    let level: WaveLevel
    /// How high the wave stands now, as a share of the lens.
    let height: CGFloat
    let d: CGFloat
    /// The wave's height over its middle, as a share of the circle.
    static let amplitude: CGFloat = 0.02
    /// One sway of the wave, in seconds.
    private static let period: Double = 7
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: d * 0.27, style: .continuous)
        shape
            .fill(LinearGradient(colors: [Lilac.lensTop, Lilac.tint], startPoint: .top, endPoint: .bottom))
            .overlay {
                shape.fill(RadialGradient(colors: [.white.opacity(0.35), .clear], center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: d * 0.3))
            }
            .overlay {
                TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || !visible)) { context in
                    Wave(level: height, amplitude: d * Self.amplitude * min(height / 0.1, 1), phase: phase(context.date))
                        .fill(level.color)
                }
                .clipShape(shape)
            }
            .frame(width: d * 0.58, height: d * 0.84)
            .offset(x: -d * 0.29)
            .frame(width: d, height: d)
            .clipShape(Circle().inset(by: d * 0.018))
            .allowsHitTesting(false)
            .onAppear { visible = true }
            .onDisappear { visible = false }
    }

    private func phase(_ date: Date) -> CGFloat {
        CGFloat(date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: Self.period) / Self.period * 2 * .pi)
    }
}

/// Water up to a level with a slow sine on top, a little longer than the shape is wide.
struct Wave: Shape {
    /// From the bottom, as a share of the height.
    var level: CGFloat
    var amplitude: CGFloat
    var phase: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(level, amplitude) }
        set { (level, amplitude) = (newValue.first, newValue.second) }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard level > 0.001 else { return path }
        let top = rect.maxY - rect.height * level
        let length = rect.width * 1.15
        let y = { (x: CGFloat) in top + amplitude * sin((x - rect.minX) / length * 2 * .pi + phase) }
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        for x in stride(from: rect.minX, to: rect.maxX, by: 3) {
            path.addLine(to: CGPoint(x: x, y: y(x)))
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: y(rect.maxX)))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
