import Foundation

/// Dates as the server sends them: 2026-10-05.
enum Dates {
    static let months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
    static let weekdays = ["П", "В", "С", "Ч", "П", "С", "В"]
    static let weekdaysShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

    /// The day of the month, its month in three letters and the year of a date, as the date beside a card shows them.
    static func parts(_ text: String) -> (day: String, month: String, year: String)? {
        let pieces = text.split(separator: "-")
        guard pieces.count == 3, let month = Int(pieces[1]), let day = Int(pieces[2]), (1...12).contains(month) else { return nil }
        return (String(day), months[month - 1], String(pieces[0]))
    }

    /// The letter of a date's day of the week, as the week strip heads its days: П for Monday.
    static func weekdayLetter(_ text: String) -> String {
        guard let date = date(text) else { return "" }
        // The calendar counts Sunday as 1, Monday as 2.
        return weekdays[(calendar.component(.weekday, from: date) + 5) % 7]
    }

    /// The short name of a date's day of the week, as the new week strip heads its days: Пн for Monday.
    static func weekdayShort(_ text: String) -> String {
        guard let date = date(text) else { return "" }
        return weekdaysShort[(calendar.component(.weekday, from: date) + 5) % 7]
    }

    /// The date `days` after a date.
    static func adding(_ days: Int, to text: String) -> String {
        guard let date = date(text), let moved = calendar.date(byAdding: .day, value: days, to: date) else { return text }
        return self.text(moved)
    }

    private static let calendar = Calendar(identifier: .gregorian)

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func date(_ text: String) -> Date? { formatter.date(from: text) }
    static func text(_ date: Date) -> String { formatter.string(from: date) }

    /// A moment as the time alone today, with the day otherwise: 14:05, 6 окт., 14:05.
    static func moment(_ date: Date) -> String {
        let style = Date.FormatStyle(locale: Locale(identifier: "ru_RU")).hour().minute()
        return date.formatted(Calendar.current.isDateInToday(date) ? style : style.day().month(.abbreviated))
    }
}
