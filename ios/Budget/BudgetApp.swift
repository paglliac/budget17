import SwiftUI

@main
struct BudgetApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(Palette.extra)
        }
    }
}

enum Tab: Hashable { case budget, operations, sort, more }

/// The login until a server is set, then the screens under a tab bar with a round «+» in its middle. The screens stay
/// alive between tabs, so each keeps its place. Coming back to the app asks the server to sync with ZenMoney.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.budget
    @State private var add: AddRequest?

    var body: some View {
        if session.server == nil {
            LoginView()
        } else {
            ZStack {
                screen(.budget) { BudgetView(add: $add) }
                screen(.operations) { OperationsView() }
                screen(.sort) { UncategorizedView() }
                screen(.more) { MoreView() }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TabBar(tab: $tab, pending: session.pending) { request in
                    tab = .budget
                    add = request
                }
            }
            // The tab bar stays at the bottom under the keyboard, as when searching operations.
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .task(id: session.version) { await session.refreshPending() }
            // budget://week and budget://sort, from the widget.
            .onOpenURL { url in tab = url.host() == "sort" ? .sort : .budget }
            .onChange(of: scenePhase, initial: true) { _, phase in
                if phase == .active { Task { await session.sync() } }
            }
        }
    }

    private func screen<Content: View>(_ value: Tab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(tab == value ? 1 : 0)
            .allowsHitTesting(tab == value)
            .accessibilityHidden(tab != value)
    }
}

/// The tabs with icons and names, the picked one violet, and the round black «+» in the middle that adds a purchase or
/// a wish.
struct TabBar: View {
    @Binding var tab: Tab
    let pending: Int
    let add: (AddRequest) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            item(.budget, "calendar", "Бюджет")
            item(.operations, "list.bullet", "Операции")
            Menu {
                Button("Покупка в план недели", systemImage: "cart") { add(.purchase("week")) }
                Button("Покупка в дополнительные", systemImage: "bag") { add(.purchase("extra")) }
                Button("Желание", systemImage: "sparkles") { add(.wish) }
            } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(Ink.band, in: Circle())
                    .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Добавить")
            item(.sort, "tag", "Разобрать", badge: pending)
            item(.more, "ellipsis", "Ещё")
        }
        .padding(.top, 4)
        .background(Ink.surface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Ink.hairline).frame(height: 0.5) }
    }

    private func item(_ value: Tab, _ icon: String, _ label: String, badge: Int = 0) -> some View {
        Button { tab = value } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .medium))
                    .frame(height: 24)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text("\(badge)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(Palette.color("red"), in: Capsule())
                                .offset(x: 10, y: -6)
                        }
                    }
                Text(label).font(.caption2.weight(.medium))
            }
            .foregroundStyle(tab == value ? Ink.violet : Ink.muted)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tab-\(label)")
        .accessibilityLabel(badge > 0 ? "\(label), \(badge)" : label)
        .accessibilityAddTraits(tab == value ? .isSelected : [])
    }
}
