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
    @State private var variant = Variant.launch
    /// The tab bar's height, for pages inside a navigation stack, which the inset under the bar does not reach.
    @State private var barHeight: CGFloat = 0

    var body: some View {
        if session.server == nil {
            LoginView()
        } else {
            ZStack {
                screen(.budget) { BudgetView(add: $add) { tab = .sort } }
                screen(.operations) { OperationsView() }
                screen(.sort) { UncategorizedView() }
                screen(.more) { MoreView() }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TabBar(tab: $tab, pending: session.pending) { request in
                    tab = .budget
                    add = request
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            }
            .environment(\.tabBarHeight, barHeight)
            .environment(\.variant, variant)
            .environment(\.setVariant, { variant = $0 })
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

/// The tabs with icons and names, the picked one violet on a lilac disc, and the round violet «+» in the middle that
/// adds a purchase or a wish.
struct TabBar: View {
    @Binding var tab: Tab
    let pending: Int
    let add: (AddRequest) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            item(.budget, "house", "Главная")
            item(.operations, "list.bullet", "Операции")
            Menu {
                Button("Покупка в план недели", systemImage: "cart") { add(.purchase("week")) }
                Button("Покупка в дополнительные", systemImage: "bag") { add(.purchase("extra")) }
                Button("Желание", systemImage: "sparkles") { add(.wish) }
            } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 50, height: 50)
                    .background(LinearGradient(colors: [Color(rgb: 0x9C8BF8), Color(rgb: 0x6E52F5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                    .shadow(color: Color(rgb: 0x6E52F5).opacity(0.35), radius: 10, y: 4)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Добавить")
            item(.sort, "tag", "Разобрать", badge: pending)
            item(.more, "ellipsis", "Ещё")
        }
        .padding(.top, 6)
        .background {
            Lilac.surface
                .ignoresSafeArea(edges: .bottom)
                .shadow(color: .black.opacity(0.06), radius: 12, y: -2)
        }
    }

    private func item(_ value: Tab, _ icon: String, _ label: String, badge: Int = 0) -> some View {
        let picked = tab == value
        return Button { tab = value } label: {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .symbolVariant(picked ? .fill : .none)
                    .font(.system(size: 19, weight: .medium))
                    .frame(width: 44, height: 32)
                    .background(picked ? Lilac.tint : .clear, in: Capsule())
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text("\(badge)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 17, minHeight: 17)
                                .background(Palette.color("red"), in: Capsule())
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
