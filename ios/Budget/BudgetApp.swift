import SwiftUI

@main
struct BudgetApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(Lilac.accent)
        }
    }
}

enum Tab: Hashable { case home, operations, plan, more }

/// The login until a server is set, then the screens under the tab bar. The screens stay alive between tabs, so each
/// keeps its place. Coming back to the app asks the server to sync with ZenMoney.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.home
    /// What the operations show: all of them, a kind, or the expenses that wait for a category.
    @State private var filter = OperationsFilter.all
    /// The tab bar's height, for pages inside a navigation stack, which the inset under the bar does not reach.
    @State private var barHeight: CGFloat = 0

    var body: some View {
        if session.server == nil {
            LoginView()
        } else {
            ZStack {
                screen(.home) { BudgetView(openPending: openPending) }
                screen(.operations) { OperationsView(filter: $filter) }
                screen(.plan) { PlanView() }
                screen(.more) { MoreView() }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TabBar(tab: $tab, pending: session.pending)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            }
            .environment(\.tabBarHeight, barHeight)
            // The tab bar stays at the bottom under the keyboard, as when searching operations.
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .task(id: session.version) { await session.refreshPending() }
            // budget://week, sort, operations and regular, from the widgets.
            .onOpenURL { url in
                switch url.host() {
                case "sort": openPending()
                case "operations":
                    filter = .all
                    tab = .operations
                case "regular": tab = .more
                default: tab = .home
                }
            }
            .onChange(of: scenePhase, initial: true) { _, phase in
                if phase == .active { Task { await session.sync() } }
            }
        }
    }

    /// The expenses that wait for a category, among the operations.
    private func openPending() {
        filter = .pending
        tab = .operations
    }

    private func screen<Content: View>(_ value: Tab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(tab == value ? 1 : 0)
            .allowsHitTesting(tab == value)
            .accessibilityHidden(tab != value)
    }
}

/// The tabs with icons and names, the picked one violet on a lilac disc; the operations carry how many expenses wait for
/// a category.
struct TabBar: View {
    @Binding var tab: Tab
    let pending: Int

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            item(.home, "house", "Главная")
            item(.operations, "list.bullet", "Операции", badge: pending)
            item(.plan, "calendar", "План")
            item(.more, "ellipsis", "Ещё")
        }
        .padding(.top, 6)
        .padding(.bottom, 2)
        .background {
            Lilac.surface
                .ignoresSafeArea(edges: .bottom)
                .shadow(color: .black.opacity(0.06), radius: 12, y: -2)
        }
        .sensoryFeedback(.selection, trigger: tab)
    }

    private func item(_ value: Tab, _ icon: String, _ label: String, badge: Int = 0) -> some View {
        let picked = tab == value
        return Button { tab = value } label: {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .symbolVariant(picked ? .fill : .none)
                    .font(.system(size: 19, weight: .medium))
                    .frame(width: 48, height: 34)
                    .background(picked ? Lilac.tint : .clear, in: Capsule())
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text("\(badge)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(Lilac.accent, in: Capsule())
                                .offset(x: -2, y: -3)
                        }
                    }
                Text(label).font(.caption2.weight(.medium))
            }
            .foregroundStyle(picked ? Lilac.accent : Lilac.muted)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tab-\(label)")
        .accessibilityLabel(badge > 0 ? "\(label), \(badge)" : label)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}
