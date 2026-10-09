import Foundation

// Screens as the server's JSON API sends them (src/web/api.ts). The server works out every figure and phrase, so these
// are plain data: rows carry an icon by its web name (see Icons), a colour as a tone or #rrggbb (see Palette) and
// where an expense or a purchase counts as `mark`.

/// A row of a list: what the web UI draws as entryRow or operationRow.
struct Row: Decodable, Hashable {
    let id: String
    let title: String
    let details: String
    let icon: String
    let color: String
    let amount: Double?
    /// week, extra, outside or ignored; nil when the row has no dot.
    let mark: String?
    let muted: Bool
}

extension Row {
    func with(amount: Double) -> Row {
        Row(id: id, title: title, details: details, icon: icon, color: color, amount: amount, mark: mark, muted: muted)
    }
}

/// A total with what it is out of and the bar under it.
struct Total: Decodable, Hashable {
    let label: String
    let amount: Double
    let note: String
    let parts: [Part]?

    struct Part: Decodable, Hashable {
        let label: String
        let value: Double
        let tone: String
    }
}

/// A day of a list under its heading: Вчера with 6 октября, вторник.
struct Day<Item: Decodable & Hashable>: Decodable, Hashable {
    let date: String
    let title: String
    let subtitle: String
    let items: [Item]
}

struct Option: Decodable, Hashable {
    let value: String
    let label: String
    /// Set for a payment to pick, as its card shows it.
    var icon: String? = nil
}

struct OptionGroup: Decodable, Hashable {
    let label: String
    let options: [Option]
}

/// Decodes the shared row fields and the ones of a kind of row from the same object.
private struct Extra: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

private extension Decoder {
    func extra() throws -> KeyedDecodingContainer<Extra> { try container(keyedBy: Extra.self) }
}

private extension KeyedDecodingContainer where Key == Extra {
    func value<T: Decodable>(_ key: String) throws -> T { try decode(T.self, forKey: Extra(stringValue: key)) }
    func optional<T: Decodable>(_ key: String) throws -> T? { try decodeIfPresent(T.self, forKey: Extra(stringValue: key)) }
}

// MARK: - Budget

/// An expense that opens to be marked by its ZenMoney id.
struct Expense: Decodable, Hashable, Identifiable {
    let row: Row
    let spending: String
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        spending = try decoder.extra().value("spending")
    }
}

struct Purchase: Decodable, Hashable {
    let id: Int
    let title: String
    let amount: Double
    let week: String
    /// week or extra.
    let envelope: String
    /// required, which had better stay in its week, or flexible, which can move.
    let kind: String
    let done: Bool
    let weekLabel: String
}

struct PurchaseAction: Decodable, Hashable {
    /// move or done, as /purchases/:id/:action takes it.
    let action: String
    let label: String
}

/// A row of a plan: a purchase, or a regular payment that falls on the week.
struct PlanItem: Decodable, Hashable, Identifiable {
    let row: Row
    let purchase: Purchase?
    let regular: Int?
    let finishable: Bool
    let actions: [PurchaseAction]
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        purchase = try c.optional("purchase")
        regular = try c.optional("regular")
        finishable = try c.optional("finishable") ?? false
        actions = try c.optional("actions") ?? []
    }
}

struct Wish: Decodable, Hashable {
    let id: Int
    let title: String
    let amount: Double
}

struct WishItem: Decodable, Hashable, Identifiable {
    let row: Row
    let wish: Wish
    let plannable: Bool
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        wish = try c.value("wish")
        plannable = try c.value("plannable")
    }
}

struct WeekScreen: Decodable {
    let symbol: String
    let today: String
    let current: String
    let week: String
    /// past, current or ahead.
    let phase: String
    let title: String
    let prev: String
    let next: String?
    let total: Total
    let home: WeekHome
    let limit: WeekLimit
    let days: [Day<Expense>]
    let plan: [PlanItem]
    /// Only the current week has them.
    let wishes: [WishItem]?
    let weekChoices: [OptionGroup]
    let source: String
}

/// A figure with what it is.
struct Figure: Decodable, Hashable {
    let label: String
    let amount: Double
}

/// The top of the week: what is free, what the plan holds by kind, what was spent today (in a past week, in all of
/// it; nothing in a week ahead), how many expenses wait for a category, and when the server last synced.
struct WeekHome: Decodable, Hashable {
    let free: Figure
    let reserved: Reserved
    let spent: Figure?
    let pending: Pending
    /// An ISO moment.
    let syncedAt: String?

    struct Reserved: Decodable, Hashable {
        let label: String
        let amount: Double
        let required: Figure
        let flexible: Figure
    }

    struct Pending: Decodable, Hashable {
        let count: Int
        let label: String
    }

    var synced: Date? {
        guard let syncedAt else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: syncedAt)
    }
}

/// What a week allows and the usual amount. Another amount posts to /api/week-limits/:week, the usual one back to
/// /api/week-limits/:week/delete.
struct WeekLimit: Decodable, Hashable {
    let amount: Double
    let usual: Double

    var changed: Bool { amount != usual }
}

struct WeekLine: Decodable, Hashable, Identifiable {
    let row: Row
    let week: String
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        week = try decoder.extra().value("week")
    }
}

struct MonthScreen: Decodable {
    let symbol: String
    let month: String
    let thisMonth: String
    let title: String
    let prev: Option
    let next: Option?
    let weeks: [WeekLine]
    let total: Total
    /// Where the month's income goes; nil without incomes.
    let flow: Flow?
    let purchases: [PlanItem]
    let spending: [Day<Expense>]
    let newPurchaseWeek: String
    let weekChoices: [OptionGroup]
    let source: String
}

/// A month's income and where it goes: regular payments, the weeks' budgets, the extras, and savings or what is short.
struct Flow: Decodable, Hashable {
    let income: Income
    let parts: [Part]

    struct Income: Decodable, Hashable {
        let label: String
        let amount: Double
        let note: String
    }

    struct Part: Decodable, Hashable {
        let label: String
        let amount: Double
        /// Of the income, 0.29 for 29%; below zero for what is short.
        let share: Double
    }
}

// MARK: - Marking

/// A choice made in one tap, posted to /api/spending/:id/:choice.
struct Choice: Decodable, Hashable, Identifiable {
    let choice: String
    let label: String
    let detail: String?
    let color: String?
    /// Set for a category or a payment, as its tile shows it.
    let icon: String?
    let current: Bool?
    let suggested: Bool?
    var id: String { choice }
    var isCurrent: Bool { current ?? false }
    var isSuggested: Bool { suggested ?? false }
}

struct SpendingScreen: Decodable, Hashable {
    let id: String
    let title: String
    let amount: Double
    let symbol: String
    /// 6 октября, 20:05.
    let when: String
    let account: String
    /// What else the bank said, such as its comment or that it has not settled the expense yet.
    let notes: [String]
    let payments: Payments
    let categories: Categories
    /// What is suggested, such as Похоже на «Продукты».
    let hint: String?
    let envelopes: [Choice]
    let undo: [Choice]

    struct Payments: Decodable, Hashable {
        let choices: [Choice]
        let others: [OptionGroup]
        let otherLabel: String
        let empty: String
    }

    struct Categories: Decodable, Hashable {
        let choices: [Choice]
        let empty: String
    }
}

// MARK: - Operations

struct OperationRow: Decodable, Hashable, Identifiable {
    let row: Row
    /// expense, income or transfer.
    let kind: String
    let comment: String?
    let hold: Bool
    let original: Original?
    /// Set for an expense, which opens to be marked.
    let spending: String?
    /// What an expense is when it is not an ordinary one of the week, such as Ждёт разбора.
    let chip: Chip?
    var id: String { row.id }

    struct Original: Decodable, Hashable {
        let amount: Double
        let symbol: String
    }

    struct Chip: Decodable, Hashable {
        let label: String
        let tone: String
    }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        kind = try c.value("kind")
        comment = try c.optional("comment")
        hold = try c.value("hold")
        original = try c.optional("original")
        spending = try c.optional("spending")
        chip = try c.optional("chip")
    }
}

struct OperationDay: Decodable, Hashable, Identifiable {
    let date: String
    let title: String
    let subtitle: String
    let net: Double
    let items: [OperationRow]
    var id: String { date }
}

struct OperationsScreen: Decodable {
    let symbol: String
    let month: String
    let months: [Option]
    let title: String
    let kinds: [Kind]
    let kind: String?
    let category: String?
    let categoryTitle: String?
    let query: String?
    let totals: Totals
    let days: [OperationDay]
    let empty: String
    let categories: [CategorySpending]
    /// Expenses of the month that wait for a category.
    let pending: Int

    /// What the operations that pass the filter spent and brought, and how many there are.
    struct Totals: Decodable, Hashable {
        let expense: Double
        let income: Double
        let count: Int
    }

    struct Kind: Decodable, Hashable {
        let value: String?
        let label: String
        let count: Int
    }

    struct CategorySpending: Decodable, Hashable, Identifiable {
        let id: String
        let title: String
        let icon: String
        let color: String
        let amount: Double
        let share: Double
    }
}

struct PendingExpense: Decodable, Hashable, Identifiable {
    let row: Row
    let spending: String
    let suggestion: Suggestion?
    var id: String { row.id }

    struct Suggestion: Decodable, Hashable {
        let choice: String
        let name: String
    }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        spending = try c.value("spending")
        suggestion = try c.optional("suggestion")
    }
}

struct UncategorizedScreen: Decodable {
    let symbol: String
    let month: String
    let months: [Option]
    let total: Total
    let pending: [Day<PendingExpense>]
    let sorted: [Day<Expense>]
    let empty: String
}

// MARK: - Setup

struct RegularEntry: Decodable, Hashable {
    let id: Int
    let title: String
    let amount: Double
    let day: Int
    let start: String?
    let end: String?
    let icon: String?
}

struct RegularItem: Decodable, Hashable, Identifiable {
    let row: Row
    let expense: RegularEntry
    /// The form's fields as the user would type them.
    let values: [String: String]
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        expense = try c.value("expense")
        values = try c.value("values")
    }
}

struct IconChoice: Decodable, Hashable {
    let icon: String
    let label: String
}

struct RegularScreen: Decodable {
    let symbol: String
    let total: Total
    let behind: [RegularItem]
    let today: String
    let ahead: [RegularItem]
    let later: [RegularItem]
    let icons: [IconChoice]
}

struct IncomeItem: Decodable, Hashable, Identifiable {
    let row: Row
    let income: Ref
    let values: [String: String]
    var id: String { row.id }

    struct Ref: Decodable, Hashable {
        let id: Int
        let model: String
    }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        let c = try decoder.extra()
        income = try c.value("income")
        values = try c.value("values")
    }
}

struct IncomePayment: Decodable, Hashable, Identifiable {
    let row: Row
    /// How the amount is worked out, such as 200 000 × 11/22 рабочих дней.
    let formula: String?
    var id: String { row.id }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        formula = try decoder.extra().optional("formula")
    }
}

struct IncomeModel: Decodable, Hashable, Identifiable {
    let id: String
    let title: String
    let fields: [Field]
    let defaults: [String: String]

    struct Field: Decodable, Hashable {
        let name: String
        let label: String
        /// amount or day.
        let kind: String
        let placeholder: String?
    }
}

struct IncomeScreen: Decodable {
    let symbol: String
    let total: Total
    let incomes: [IncomeItem]
    let upcoming: [Day<IncomePayment>]
    let models: [IncomeModel]
}

struct CategoryItem: Decodable, Hashable, Identifiable {
    let row: Row
    let category: Info
    var id: String { row.id }

    struct Info: Decodable, Hashable {
        let id: String
        let name: String
        /// nil for one of the user's own.
        let zenmoneyTitle: String?
        let hidden: Bool
    }

    init(from decoder: Decoder) throws {
        row = try Row(from: decoder)
        category = try decoder.extra().value("category")
    }
}

struct CategoriesScreen: Decodable {
    let shown: [CategoryItem]
    let hidden: [CategoryItem]
}

/// The day a week begins on, which posts to /api/budget/week-start/:day.
struct BudgetSettingsScreen: Decodable {
    let symbol: String
    /// 0 for Monday to 6 for Sunday.
    let weekStart: Int
    /// The days to pick from, Monday first.
    let weekdays: [Weekday]
    /// What a week allows unless it has an amount of its own.
    let limit: Double

    struct Weekday: Decodable, Hashable {
        let value: Int
        let label: String
    }
}

struct SessionInfo: Decodable {
    let user: String?
    let symbol: String
    let source: String
    let canSync: Bool
    let syncedAt: String?
}
