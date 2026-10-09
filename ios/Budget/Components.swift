import SwiftUI

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
/// app, or when what it shows changes, such as another week. What the server sent last for the screen shows at once
/// while it answers; when it cannot be reached, that copy stays, with the time it was saved on a pill that opens the
/// server.
struct Screen<Value: Decodable, Content: View>: View {
    let path: String
    var query: [String: String?] = [:]
    @ViewBuilder let content: (Value) -> Content

    @Environment(Session.self) private var session
    @State private var value: Value?
    /// What the shown value answers, to tell another week from the same one loaded again.
    @State private var shown: Request?
    /// When the server sent the shown value.
    @State private var sentAt: Date?
    /// The server could not be reached the last time the screen asked it.
    @State private var unreachable = false
    @State private var error: String?
    @State private var showServer = false

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
                    Button("Сервер") { showServer = true }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .overlay(alignment: .bottom) {
            if unreachable, value != nil, let sentAt {
                OfflinePill(date: sentAt) { showServer = true }.padding(.bottom, 12)
            }
        }
        .task(id: Key(request: Request(path: path, query: query), version: session.version)) { await load() }
        .refreshable {
            await session.sync()
            await load()
        }
        .sheet(isPresented: $showServer) { ServerSheet() }
    }

    private struct Request: Equatable {
        let path: String
        let query: [String: String?]
    }

    private struct Key: Equatable {
        let request: Request
        let version: Int
    }

    private func load() async {
        let request = Request(path: path, query: query)
        if request != shown, let copy: (value: Value, date: Date) = session.saved(path, query) {
            value = copy.value
            shown = request
            sentAt = copy.date
        }
        do {
            value = try await session.get(path, query)
            shown = request
            sentAt = .now
            unreachable = false
            error = nil
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
        } catch {
            // Keep showing what was loaded or saved before; only an empty screen shows the error.
            if value == nil { self.error = error.localizedDescription }
            if case APIError.unreachable = error { unreachable = true }
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
