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

enum Tab: Hashable { case wishes, operations, home, plan, more }

/// Opens a shop on the tab of shops of «Ещё», from an expense of it, as the root sets it up.
nonisolated struct OpenShopAction: Sendable {
    var open: @MainActor @Sendable (Shop) -> Void = { _ in }

    @MainActor func callAsFunction(_ shop: Shop) { open(shop) }
}

extension EnvironmentValues {
    @Entry var openShop = OpenShopAction()
}

/// The login until a server is set, then the screens under the tab bar. The screens stay alive between tabs, so each
/// keeps its place; a tap on the open «Главная» brings the main page back. Coming back to the app asks the server to
/// sync with ZenMoney.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.home
    /// What the operations show: all of them, a kind, or the expenses that wait for a category.
    @State private var filter = OperationsFilter.all
    /// The tab bar's height, for pages inside a navigation stack, which the inset under the bar does not reach.
    @State private var barHeight: CGFloat = 0
    /// Counts the returns to the main page: a tap on the open «Главная» and a link from the week's widget.
    @State private var homeReturns = 0
    /// Counts the links from the extras' widget, which open this month on its extras.
    @State private var extrasOpens = 0
    /// The week the plan shows; nil is the current one. The main page's «Зарезервировано» opens the plan on its week.
    @State private var planWeek: String?
    /// A shop an expense opened, which «Ещё» shows on its tab of shops.
    @State private var shop: Shop?

    var body: some View {
        if session.server == nil {
            LoginView()
        } else {
            ZStack {
                screen(.wishes) { WishesView() }
                screen(.operations) { OperationsView(filter: $filter) }
                screen(.home) { BudgetView(openPending: openPending, openPlan: openPlan, returns: homeReturns, extrasOpens: extrasOpens) }
                screen(.plan) { PlanView(week: $planWeek) }
                screen(.more) { MoreView(opening: $shop) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TabBar(tab: $tab, pending: session.pending, reselect: reselect)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            }
            .environment(\.tabBarHeight, barHeight)
            .environment(\.openShop, OpenShopAction { opened in
                shop = opened
                tab = .more
            })
            // The tab bar stays at the bottom under the keyboard, as when searching operations.
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .task(id: session.version) { await session.refreshPending() }
            // budget://week, sort, operations, regular and extras, from the widgets.
            .onOpenURL { url in
                switch url.host() {
                case "sort": openPending()
                case "extras":
                    tab = .home
                    extrasOpens += 1
                case "operations":
                    filter = .all
                    tab = .operations
                case "regular": tab = .more
                default:
                    tab = .home
                    homeReturns += 1
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

    /// The plan of a week, from the main page.
    private func openPlan(_ week: String?) {
        planWeek = week
        tab = .plan
    }

    private func reselect(_ value: Tab) {
        if value == .home { homeReturns += 1 }
    }

    private func screen<Content: View>(_ value: Tab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(tab == value ? 1 : 0)
            .allowsHitTesting(tab == value)
            .accessibilityHidden(tab != value)
    }
}

/// The tabs after the user's picture of 2026-10-12: a white bar with round top corners, «Желания» and «Операции» on one
/// side, «План» and «Ещё» on the other, and «Главная» raised between them as the main page's circle, the user's mascot.
/// The picked tab is violet and filled, the circle gets a violet ring; the operations carry how many expenses wait for a
/// category.
struct TabBar: View {
    @Binding var tab: Tab
    let pending: Int
    /// A tap on the tab that is open.
    let reselect: (Tab) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            item(.wishes, "sparkles", "Желания")
            item(.operations, "list.bullet", "Операции", badge: pending)
            Color.clear.frame(width: 84, height: 1)
            item(.plan, "calendar", "План")
            item(.more, "ellipsis", "Ещё")
        }
        .padding(.horizontal, 6)
        .padding(.top, 10)
        .padding(.bottom, 2)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous)
                .fill(Lilac.surface)
                .shadow(color: .black.opacity(0.07), radius: 16, y: -2)
                .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) { home.offset(y: -15) }
        .sensoryFeedback(.selection, trigger: tab)
    }

    /// «Главная»: the main page's circle in a lilac halo, standing above the bar's edge.
    private var home: some View {
        let picked = tab == .home
        return Button {
            if picked { reselect(.home) } else { tab = .home }
        } label: {
            Mascot(d: 56)
                .overlay { if picked { Circle().strokeBorder(Lilac.accent, lineWidth: 2) } }
                .padding(7)
                .background(Lilac.tint, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.card)
        .accessibilityIdentifier("tab-Главная")
        .accessibilityLabel("Главная")
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private func item(_ value: Tab, _ icon: String, _ label: String, badge: Int = 0) -> some View {
        let picked = tab == value
        return Button {
            if picked { reselect(value) } else { tab = value }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .symbolVariant(picked ? .fill : .none)
                    .font(.system(size: 20, weight: picked ? .semibold : .regular))
                    .frame(width: 44, height: 26)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text("\(badge)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(Lilac.accent, in: Capsule())
                                .offset(x: 2, y: -5)
                        }
                    }
                Text(label).font(.system(size: 11, weight: picked ? .semibold : .medium))
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
