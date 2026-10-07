import Foundation

/// What the widget shows, as /api/widget sends it: what is left of the current week with its bar, and the expenses of
/// this month that still wait for a category.
struct WidgetData: Codable, Hashable {
    let symbol: String
    /// 5–11 октября.
    let week: String
    let free: Double
    /// из 45 000 руб. на неделю.
    let note: String
    let parts: [Part]
    let pending: Pending

    struct Part: Codable, Hashable {
        let label: String
        let value: Double
        let tone: String
    }

    struct Pending: Codable, Hashable {
        let count: Int
        let amount: Double
        /// 2 траты без категории, or Всё разобрано.
        let note: String
    }

    static let sample = WidgetData(
        symbol: "руб.",
        week: "5–11 октября",
        free: 17_148.59,
        note: "из 45 000 руб. на неделю",
        parts: [
            Part(label: "Потрачено", value: 5_851, tone: "yellow"),
            Part(label: "План", value: 22_000, tone: "violet"),
            Part(label: "Свободно", value: 17_149, tone: "gray"),
        ],
        pending: Pending(count: 2, amount: 1_070, note: "2 траты без категории")
    )
}
