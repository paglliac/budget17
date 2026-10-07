import SwiftUI

/// An icon on a tinted circle, as rows of the web UI start.
struct IconBadge: View {
    let icon: String
    let color: Color
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: Icons.symbol(icon))
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.16), in: Circle())
    }
}

/// Where an expense or a purchase counts, before its amount: yellow in the week, violet in the extras, a ring outside.
struct MarkDot: View {
    let mark: String?

    var body: some View {
        switch mark {
        case "week": Circle().fill(Palette.week).frame(width: 7, height: 7).accessibilityLabel("В неделе")
        case "extra": Circle().fill(Palette.extra).frame(width: 7, height: 7).accessibilityLabel("Дополнительные")
        case "outside", "ignored": Circle().strokeBorder(Color.secondary, lineWidth: 1.2).frame(width: 7, height: 7).accessibilityLabel("Вне бюджета")
        default: EmptyView()
        }
    }
}

/// Lays chips out in lines, as many to a line as fit.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                y += line + spacing
                x = 0
                line = 0
            }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                y += line + spacing
                x = bounds.minX
                line = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

/// Loads a screen from the server, shows it, and loads it again on pull to refresh, after a change anywhere in the
/// app, or when what it shows changes, such as another week.
struct Screen<Value: Decodable, Content: View>: View {
    let path: String
    var query: [String: String?] = [:]
    @ViewBuilder let content: (Value) -> Content

    @Environment(Session.self) private var session
    @State private var value: Value?
    @State private var error: String?

    var body: some View {
        Group {
            if let value {
                content(value)
            } else if let error {
                ContentUnavailableView {
                    Label("Не удалось загрузить", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Повторить") { Task { await load() } }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: Key(path: path, query: query, version: session.version)) { await load() }
        .refreshable {
            await session.sync()
            await load()
        }
    }

    private struct Key: Equatable {
        let path: String
        let query: [String: String?]
        let version: Int
    }

    private func load() async {
        do {
            value = try await session.get(path, query)
            error = nil
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
        } catch {
            // Keep showing what was loaded before; only an empty screen shows the error.
            if value == nil { self.error = error.localizedDescription }
        }
    }
}

/// A form's error under its field.
struct FieldError: View {
    let text: String?

    var body: some View {
        if let text {
            Text(text).font(.footnote).foregroundStyle(Palette.color("red"))
        }
    }
}

extension View {
    /// Runs a change and shows what went wrong in an alert.
    func errorAlert(_ error: Binding<String?>) -> some View {
        alert("Не получилось", isPresented: Binding(get: { error.wrappedValue != nil }, set: { if !$0 { error.wrappedValue = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error.wrappedValue ?? "")
        }
    }
}
