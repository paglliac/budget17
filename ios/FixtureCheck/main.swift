import Foundation

// Reads screens the server's API produced from demo data (scripts/api-fixtures.ts) with the app's models, so a change of
// the JSON the app could not read fails make ios-check. Models.swift and WidgetData.swift are links to the app's.

let folder = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? ".")
var failed = false

func check<T: Decodable>(_ type: T.Type, _ name: String) {
    let file = folder.appending(path: "\(name).json")
    do {
        _ = try JSONDecoder().decode(T.self, from: try Data(contentsOf: file))
        print("ok    \(name)")
    } catch {
        print("FAIL  \(name): \(error)")
        failed = true
    }
}

check(SessionInfo.self, "session")
check(WeekScreen.self, "week")
check(WeekScreen.self, "week-past")
check(WeekScreen.self, "week-ahead")
check(MonthScreen.self, "month")
check(MonthScreen.self, "month-without-incomes")
check(SpendingScreen.self, "spending")
check(SpendingScreen.self, "spending-income")
check(OperationsScreen.self, "operations")
check(OperationsScreen.self, "operations-income")
check(UncategorizedScreen.self, "uncategorized")
check(RegularScreen.self, "regular")
check(IncomeScreen.self, "income")
check(CategoriesScreen.self, "categories")
check(BudgetSettingsScreen.self, "budget-settings")
check(WidgetData.self, "widget")
exit(failed ? 1 : 0)
