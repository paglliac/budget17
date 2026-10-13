import Foundation

/// What the widgets show, as /api/widget sends it: the week with its days, what was spent today, the expenses of this
/// month that wait for a category, what this month saved against the months before it, the next regular payment, and
/// the extras of this month with where they are headed.
struct WidgetData: Codable, Hashable {
    let symbol: String
    let week: Week
    let today: Today
    let pending: Pending
    let savings: Savings
    let payment: Payment?
    /// A server from before the extras' widget sends none.
    let extras: Extras?

    struct Week: Codable, Hashable {
        /// Неделя.
        let label: String
        let free: Double
        /// свободно до конца недели.
        let note: String
        let days: [Day]
    }

    struct Day: Codable, Hashable {
        /// Пн.
        let label: String
        let today: Bool
        let ahead: Bool
        let spent: Bool
    }

    struct Today: Codable, Hashable {
        /// Сегодня потрачено.
        let label: String
        let amount: Double
        /// When the server last synced with ZenMoney, as an ISO moment.
        let syncedAt: String?

        var synced: Date? {
            guard let syncedAt else { return nil }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.date(from: syncedAt)
        }
    }

    struct Pending: Codable, Hashable {
        let count: Int
        let amount: Double
        /// Of this month's expenses, the share that has a category, 0…1.
        let sorted: Double
        /// траты ждут разбора, under the count; Всё разобрано.
        let label: String
        /// 4 траты ждут разбора; Все операции разобраны.
        let title: String
        /// на 1 070 ₽; Отличная работа!
        let note: String
    }

    struct Savings: Codable, Hashable {
        /// Накопления.
        let label: String
        /// в этом месяце.
        let period: String
        let amount: Double
        let change: Change?
        /// This month last.
        let months: [Month]
    }

    struct Change: Codable, Hashable {
        /// up, down or same.
        let direction: String
        /// на 27% больше.
        let label: String
        /// чем в прошлом месяце.
        let note: String?
    }

    struct Month: Codable, Hashable {
        let month: String
        let amount: Double
    }

    struct Payment: Codable, Hashable {
        let title: String
        let amount: Double
        /// 21 октября.
        let date: String
        /// через 12 дней.
        let when: String
    }

    /// Доп. бюджет: what is free of the month's extras, «из 100 000 ₽», or how far past them, «сверх 100 000 ₽», with
    /// what is spent of them and what the plan holds for them.
    struct Extras: Codable, Hashable {
        let label: String
        let amount: Double
        let over: Bool
        let note: String
        let limit: Double
        let spent: Double
        let planned: Double
        /// A server from before the forecast sends none.
        var forecast: Forecast? = nil
    }

    /// Where the month's extras are headed by its end, as the server tells it: «Есть запас», «Спокойно», «Впритык» or
    /// «Нужно сократить» with its sentence and figure, what is left of them now, and the line of what they set aside.
    struct Forecast: Codable, Hashable {
        /// plenty, calm, tight or short.
        let state: String
        /// Финансовый помощник.
        let label: String
        /// Прогноз.
        let action: String
        /// Есть запас.
        let title: String
        /// Даже с учётом запланированного вы, вероятно, отложите.
        let lead: String
        /// отложите; дефицит.
        let brief: String
        /// ≈ 38 000 ₽; −12 000 ₽.
        let figure: String
        let left: Left
        /// From the month's first day to its end; the last point is what will be left.
        let path: [Point]

        /// What is left of the extras before the plan, «осталось», or how far past them in red.
        struct Left: Codable, Hashable {
            let amount: Double
            let over: Bool
            let note: String
        }

        struct Point: Codable, Hashable {
            /// Where in the month, 0 to 1.
            let share: Double
            let amount: Double
            /// The end of a week, drawn as a dot.
            let week: Bool
        }
    }

    static let sample = WidgetData(
        symbol: "₽",
        week: Week(
            label: "Неделя",
            free: 21_000,
            note: "свободно до конца недели",
            days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].enumerated().map { index, label in
                Day(label: label, today: index == 1, ahead: index > 1, spent: index < 1)
            }
        ),
        today: Today(label: "Сегодня потрачено", amount: 2_350, syncedAt: nil),
        pending: Pending(count: 4, amount: 1_070, sorted: 0.9, label: "траты ждут разбора", title: "4 траты ждут разбора", note: "на 1 070 ₽"),
        savings: Savings(
            label: "Накопления",
            period: "в этом месяце",
            amount: 325_000,
            change: Change(direction: "up", label: "на 27% больше", note: "чем в прошлом месяце"),
            months: [120, 135, 140, 150, 165, 180, 205, 230, 256, 325].enumerated().map { index, thousands in
                Month(month: "2026-\(String(format: "%02d", index + 1))", amount: Double(thousands) * 1000)
            }
        ),
        payment: Payment(title: "Ипотека", amount: 29_000, date: "21 октября", when: "через 12 дней"),
        extras: Extras(
            label: "Доп. бюджет", amount: 68_500, over: false, note: "из 100 000 ₽", limit: 100_000, spent: 17_600, planned: 13_900,
            forecast: Forecast(
                state: "plenty", label: "Финансовый помощник", action: "Прогноз", title: "Есть запас",
                lead: "Даже с учётом запланированного вы, вероятно, отложите", brief: "отложите", figure: "≈\u{00A0}69\u{00A0}000\u{00A0}₽",
                left: Forecast.Left(amount: 82_400, over: false, note: "осталось"),
                path: [(0, 0, false), (0.25, 21_000, true), (0.4, 26_000, false), (0.5, 33_000, true), (0.75, 51_000, true), (1, 68_500, true)].map {
                    Forecast.Point(share: $0.0, amount: $0.1, week: $0.2)
                }
            )
        )
    )
}
