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

/// What the «+» of the tab bar adds: a purchase into the current week's plan or into the extras, or a wish.
enum Addition { case week, extra, wish }

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
    /// A purchase or a wish added from the «+» of the tab bar.
    @State private var sheet: BudgetSheet?

    var body: some View {
        if session.server == nil {
            LoginView()
        } else {
            ZStack {
                screen(.home) { BudgetView(openPending: openPending, returns: homeReturns) }
                screen(.operations) { OperationsView(filter: $filter) }
                screen(.plan) { PlanView() }
                screen(.more) { MoreView() }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TabBar(tab: $tab, pending: session.pending, reselect: reselect, add: add)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            }
            .environment(\.tabBarHeight, barHeight)
            // The tab bar stays at the bottom under the keyboard, as when searching operations.
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .budgetSheets($sheet)
            .task(id: session.version) { await session.refreshPending() }
            // budget://week, sort, operations and regular, from the widgets.
            .onOpenURL { url in
                switch url.host() {
                case "sort": openPending()
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

    private func reselect(_ value: Tab) {
        if value == .home { homeReturns += 1 }
    }

    /// A purchase goes into the current week, which gives it the weeks to pick from; the saved week when the server
    /// cannot be reached.
    private func add(_ addition: Addition) {
        let envelope: String
        switch addition {
        case .wish:
            sheet = .wish(nil)
            return
        case .week: envelope = "week"
        case .extra: envelope = "extra"
        }
        Task {
            let fresh: WeekScreen? = try? await session.get("week")
            let saved: (value: WeekScreen, date: Date)? = session.saved("week")
            guard let s = fresh ?? saved?.value else { return }
            sheet = .purchase(PurchaseDraft.new(s, envelope: envelope))
        }
    }

    private func screen<Content: View>(_ value: Tab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(tab == value ? 1 : 0)
            .allowsHitTesting(tab == value)
            .accessibilityHidden(tab != value)
    }
}

/// The tabs after the user's picture of 2026-10-12: a white bar with round top corners, two tabs on each side and a raised
/// violet «+» between them that adds a purchase or a wish. The picked tab is violet and filled, the operations carry how
/// many expenses wait for a category.
struct TabBar: View {
    @Binding var tab: Tab
    let pending: Int
    /// A tap on the tab that is open.
    let reselect: (Tab) -> Void
    let add: (Addition) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            item(.home, "house", "Главная")
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
        .overlay(alignment: .top) { plus.offset(y: -15) }
        .sensoryFeedback(.selection, trigger: tab)
    }

    /// The violet «+» in a lilac halo, standing above the bar's edge.
    private var plus: some View {
        Menu {
            Button("В план недели", systemImage: "cart") { add(.week) }
            Button("В дополнительные", systemImage: "bag") { add(.extra) }
            Button("Желание", systemImage: "sparkles") { add(.wish) }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(LinearGradient(colors: [Color(rgb: 0x9C8BF8), Color(rgb: 0x6E52F5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                .shadow(color: Color(rgb: 0x6E52F5).opacity(0.35), radius: 10, y: 5)
                .padding(7)
                .background(Lilac.tint, in: Circle())
        }
        .accessibilityLabel("Добавить")
        .accessibilityIdentifier("tab-add")
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
