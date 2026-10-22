import SwiftUI

/// Why a week went below zero, opened from the red figure on the main circle, as what to do about it: where the week
/// is; «Что изменилось», the changes made in the app that took from the week, each opening what it changed;
/// «Проверь траты», the expenses the week counts only by default that are a lot, alone or as a run of small ones,
/// each to open and mark or to confirm with «Верно», which the server keeps; then reminders, each only when it is a
/// lot, to keep to the plan or to spend less on the optional, folded to their rows.
struct WeekWhyView: View {
    let week: String
    @Binding var sheet: BudgetSheet?
    let openPlan: () -> Void
    @Environment(Session.self) private var session
    @State private var error: String?
    @State private var confirmed = 0
    /// Runs and reminders opened to their rows.
    @State private var opened: Set<String> = []
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "week-why", query: ["week": week]) { (s: WeekWhyScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.subtitle).font(.subheadline).foregroundStyle(Lilac.muted)
                        LilacAmount(amount: s.now.amount, symbol: s.symbol, size: 44, color: s.now.amount < -0.5 ? Lilac.red : nil)
                    }
                    .padding(.top, 6)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("why-now")
                    if let changes = s.changes { changeList(changes, screen: s) }
                    if let check = s.check { checks(check, symbol: s.symbol) }
                    if !s.reminders.isEmpty { reminders(s.reminders, symbol: s.symbol).padding(.top, 22) }
                    if let empty = s.empty { LilacEmpty(text: empty).padding(.top, 12) }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Почему неделя ушла в минус")
        .errorAlert($error)
        .sensoryFeedback(.success, trigger: confirmed)
    }

    @ViewBuilder
    private func changeList(_ changes: WeekWhyScreen.Changes, screen s: WeekWhyScreen) -> some View {
        LilacHeading(changes.title)
        ForEach(Array(changes.rows.enumerated()), id: \.element.id) { index, item in
            Button { open(item, screen: s) } label: {
                LilacRow(marker: item.spending != nil ? .expense(item.row) : .icon(item.row), title: item.row.title, details: item.row.details,
                         amount: item.row.amount, symbol: s.symbol, first: index == 0, chevron: false)
            }
            .buttonStyle(.card)
            .accessibilityIdentifier(item.id)
        }
    }

    @ViewBuilder
    private func checks(_ check: WeekWhyScreen.Checks, symbol: String) -> some View {
        LilacHeading(check.title)
        ForEach(Array(check.rows.enumerated()), id: \.element.id) { index, item in
            let run = item.spending == nil
            Button {
                if let spending = item.spending { sheet = .spending(spending) } else { toggle(item.id) }
            } label: {
                LilacRow(marker: run ? .icon(item.row) : .expense(item.row), title: item.row.title, details: item.row.details,
                         amount: item.row.amount, symbol: symbol, first: index == 0, chevron: false) {
                    LilacInlineAction(label: "Верно") { confirm(item.confirms) }
                        .accessibilityIdentifier("\(item.id)-right")
                }
            }
            .buttonStyle(.card)
            .accessibilityIdentifier(item.id)
            if run && opened.contains(item.id) {
                ForEach(item.parts) { part in
                    Button { sheet = .spending(part.spending) } label: {
                        LilacRow(marker: .expense(part.row), title: part.row.title, details: part.row.details, amount: part.row.amount,
                                 symbol: symbol, chevron: false, amountColor: part.optional ? Palette.optional : .primary)
                    }
                    .buttonStyle(.card)
                    .padding(.leading, 30)
                }
            }
        }
    }

    private func reminders(_ reminders: [WhyReminder], symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(reminders) { reminder in
                let tone = Palette.color(reminder.row.color)
                let open = opened.contains(reminder.id)
                VStack(alignment: .leading, spacing: 0) {
                    Button { toggle(reminder.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: Icons.symbol(reminder.row.icon))
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(tone)
                                .frame(width: 36, height: 36)
                                .background(tone.opacity(0.14), in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reminder.row.title).font(.body.weight(.semibold))
                                if !reminder.row.details.isEmpty { Text(reminder.row.details).font(.subheadline).foregroundStyle(Lilac.muted) }
                            }
                            Spacer(minLength: 8)
                            Text(Money.text(reminder.row.amount ?? 0, symbol)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(tone)
                            Image(systemName: "chevron.down")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Lilac.muted.opacity(0.7))
                                .rotationEffect(.degrees(open ? 180 : 0))
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(reminder.id)
                    if open {
                        ForEach(Array(reminder.rows.enumerated()), id: \.element.id) { index, item in
                            Button { openRow(item) } label: {
                                LilacRow(marker: item.spending != nil ? .expense(item.row) : .icon(item.row), title: item.row.title,
                                         details: item.row.details, amount: item.row.amount, symbol: symbol, first: index == 0, chevron: false,
                                         amountColor: item.optional ? Palette.optional : .primary)
                            }
                            .buttonStyle(.card)
                            .padding(.horizontal, 14)
                        }
                    }
                }
                .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    private func toggle(_ id: String) {
        withAnimation(.snappy) {
            if opened.contains(id) { opened.remove(id) } else { opened.insert(id) }
        }
    }

    /// Says the expenses count right in the week; the screen loads again without them.
    private func confirm(_ ids: [String]) {
        Task {
            do {
                try await session.send("spending/confirmed", ["ids": ids.joined(separator: ",")])
                confirmed += 1
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// What a change opens: the expense, the purchase's form, the wish, the form of what the week allows, or the plan.
    private func open(_ item: WhyChange, screen s: WeekWhyScreen) {
        if let spending = item.spending {
            sheet = .spending(spending)
        } else if let wish = item.wish {
            sheet = .wish(wish)
        } else if let purchase = item.purchase {
            sheet = .purchase(PurchaseDraft(purchase: purchase, week: purchase.week, envelope: purchase.envelope, choices: s.weekChoices ?? [],
                                            actions: item.actions, symbol: s.symbol))
        } else if item.limit, let limit = s.limit {
            sheet = .weekLimit(WeekLimitDraft(week: s.week, title: s.subtitle, limit: limit, symbol: s.symbol))
        } else if item.plan {
            openPlan()
        }
    }

    private func openRow(_ item: WhyRow) {
        if let spending = item.spending {
            sheet = .spending(spending)
        } else if item.plan {
            openPlan()
        }
    }
}
