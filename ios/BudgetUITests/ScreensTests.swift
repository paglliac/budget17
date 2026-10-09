import XCTest

/// Walks the app's screens against a running server and saves a screenshot of each, for a look with eyes. It only
/// opens and closes things, so it can run against real data:
///   ios/screens.sh http://localhost:4318 <folder>
@MainActor
final class ScreensTests: XCTestCase {
    private var app: XCUIApplication!
    private var folder: URL?
    private var count = 0

    override func setUp() async throws {
        continueAfterFailure = true
        let environment = ProcessInfo.processInfo.environment
        folder = environment["SCREENSHOTS"].map { URL(fileURLWithPath: $0) }
        app = XCUIApplication()
        app.launchArguments = ["-server", environment["SERVER"] ?? "http://localhost:4318"]
        app.launch()
    }

    func testScreens() throws {
        let reserved = app.buttons["reserved"]
        XCTAssert(reserved.waitForExistence(timeout: 15), "the main page loads")
        shot("home")

        app.buttons["week-limit"].tap()
        if app.buttons["form-save"].waitForExistence(timeout: 5) {
            shot("week-limit")
            app.buttons["Отмена"].tap()
        } else {
            XCTFail("the week's budget opens")
        }

        app.buttons["pick-week"].tap()
        if app.buttons["week-prev"].waitForExistence(timeout: 5) {
            shot("week-picker")
            app.buttons["week-prev"].tap()
            XCTAssert(app.buttons["Сейчас"].waitForExistence(timeout: 10), "the week before opens")
            sleep(2)
            shot("home-past")
            app.buttons["Сейчас"].tap()
            sleep(2)
        } else {
            XCTFail("the week picker opens")
        }

        reserved.tap()
        XCTAssert(app.staticTexts["Зарезервировано"].waitForExistence(timeout: 10), "the plan opens")
        shot("reserved")
        let purchase = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'purchase-'")).firstMatch
        if purchase.waitForExistence(timeout: 5) {
            purchase.tap()
            if sheet("purchase-sheet").waitForExistence(timeout: 5) { shot("purchase") }
            app.buttons["Отмена"].tap()
        }
        app.buttons["add-purchase"].firstMatch.tap()
        let toWeek = app.buttons["В план недели"]
        if toWeek.waitForExistence(timeout: 5) {
            toWeek.tap()
            if sheet("purchase-sheet").waitForExistence(timeout: 5) { shot("purchase-new") }
            app.buttons["Отмена"].tap()
        }
        app.swipeUp()
        shot("reserved-more")
        back()

        let expense = openWeekSpending()
        XCTAssert(expense.waitForExistence(timeout: 10), "the week's spending opens")
        shot("week-spending")
        expense.tap()
        if sheet("marking").waitForExistence(timeout: 10) {
            shot("spending")
            unfold()
            shot("spending-unfolded")
            app.buttons["Платёж"].tap()
            shot("spending-payment")
            app.swipeUp()
            shot("spending-more")
            app.buttons["Готово"].tap()
        } else {
            XCTFail("the expense opens")
        }
        back()

        app.buttons["Месяц"].firstMatch.tap()
        sleep(2)
        shot("month")
        app.swipeUp()
        shot("month-more")
        app.swipeDown()
        app.buttons["Неделя"].firstMatch.tap()
        sleep(1)

        tab("Операции")
        XCTAssert(app.buttons["categories"].waitForExistence(timeout: 10), "operations load")
        shot("operations")
        app.buttons["categories"].tap()
        if sheet("categories-sheet").waitForExistence(timeout: 5) {
            shot("categories-spending")
            app.buttons["Готово"].tap()
        }
        app.buttons["Найти"].tap()
        shot("operations-search")
        app.buttons["Отмена"].tap()
        app.buttons["filter-Ждут разбора"].tap()
        sleep(2)
        shot("operations-pending")
        app.buttons["filter-Доходы"].tap()
        sleep(2)
        shot("operations-income")
        let income = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        if income.waitForExistence(timeout: 5) {
            income.tap()
            if sheet("marking").waitForExistence(timeout: 10) {
                shot("income-sheet")
                app.buttons["picked"].tap()
                shot("income-sheet-folded")
                app.buttons["Готово"].tap()
            } else {
                XCTFail("the income opens")
            }
        }
        app.buttons["categories"].tap()
        if sheet("categories-sheet").waitForExistence(timeout: 5) {
            shot("categories-income")
            app.buttons["Готово"].tap()
        }
        app.buttons["filter-Все"].tap()

        tab("План")
        sleep(1)
        shot("plan")
        app.swipeUp()
        shot("plan-more")

        tab("Ещё")
        shot("regular")
        pill("Доходы").tap()
        sleep(1)
        shot("income")
        pill("Категории").tap()
        sleep(1)
        shot("categories")
        app.buttons["Настройки"].tap()
        if sheet("settings").waitForExistence(timeout: 5) {
            sleep(1)
            shot("settings")
            app.buttons["Готово"].tap()
        }
    }

    /// Marks an expense and takes it back: a category, a payment and where it counts. It changes data, so it runs only
    /// against a server with copied databases: TEST_RUNNER_MARKING=1.
    func testMarking() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["MARKING"] == "1", "changes data: only against a copy")
        XCTAssert(app.buttons["reserved"].waitForExistence(timeout: 15))
        let expense = openWeekSpending()
        XCTAssert(expense.waitForExistence(timeout: 10))
        expense.tap()
        XCTAssert(sheet("marking").waitForExistence(timeout: 10))
        shot("marking-before")

        unfold()
        let tile = sheet("marking").buttons.matching(NSPredicate(format: "label BEGINSWITH 'Продукты'")).firstMatch
        tile.tap()
        shot("marking-category")
        XCTAssert(app.staticTexts["категория"].waitForExistence(timeout: 5), "the category shows on top")
        XCTAssert(app.buttons["Платёж"].waitForNonExistence(timeout: 5), "a pick folds the others away")
        shot("marking-folded")
        let undo = app.buttons["Убрать категорию"]
        if undo.waitForExistence(timeout: 5) { undo.tap() }
        sleep(1)
        shot("marking-category-undone")

        unfold()
        shot("marking-unfolded")
        app.buttons["Платёж"].tap()
        shot("marking-payments")
        let card = sheet("marking").buttons.matching(NSPredicate(format: "label CONTAINS '₽'")).firstMatch
        // The cards fade in one after another when they unfold.
        wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: card)], timeout: 5)
        card.tap()
        XCTAssert(app.staticTexts["оплатила платёж"].waitForExistence(timeout: 5), "the payment shows on top")
        shot("marking-payment")
        let unlink = app.buttons["Отвязать"]
        if unlink.waitForExistence(timeout: 5) { unlink.tap() }
        sleep(1)
        shot("marking-payment-undone")

        let description = sheet("description")
        description.tap()
        description.typeText("Проверка описания\n")
        sleep(2)
        shot("marking-description")
        app.buttons["Готово"].tap()
        XCTAssert(sheet("marking").waitForNonExistence(timeout: 5))
        expense.tap()
        XCTAssert(description.waitForExistence(timeout: 10))
        XCTAssertEqual(description.value as? String, "Проверка описания", "the description is kept")
        // At the end of the text, so the deletes take all of it.
        description.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        description.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Проверка описания".count) + "\n")
        sleep(1)
        XCTAssert(["", "Описание"].contains(description.value as? String ?? ""), "the description is taken away")

        XCTAssert(sheet("place").waitForExistence(timeout: 5), "only the place picked shows")
        let extra = countIn("Дополнительные")
        XCTAssert(extra.wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssert(sheet("place").waitForExistence(timeout: 5), "a pick folds the other places away")
        shot("marking-extra")
        let week = countIn("Неделя")
        XCTAssert(week.wait(for: \.isSelected, toEqual: true, timeout: 5))
    }

    /// Picks where the open expense counts, unfolding the places first.
    private func countIn(_ label: String) -> XCUIElement {
        let place = sheet("marking").buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
        sheet("place").tap()
        shot("marking-places")
        wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: place)], timeout: 5)
        place.tap()
        return place
    }

    /// Unfolds the categories and payments of the open expense, when a pick folded them.
    private func unfold() {
        if !app.buttons["Платёж"].waitForExistence(timeout: 2) { app.buttons["Выбрать другое"].tap() }
        XCTAssert(app.buttons["Платёж"].waitForExistence(timeout: 5), "the categories and payments unfold")
    }

    /// Loads the screens from the server, opens the app again with a server that is gone, and switches back to the
    /// working one from the pill. It reads only, so it runs against real data.
    func testOffline() throws {
        let reserved = app.buttons["reserved"]
        XCTAssert(reserved.waitForExistence(timeout: 15), "the week loads")
        sleep(2)
        app.terminate()
        let server = app.launchArguments[1]
        app.launchArguments = ["-server", "http://localhost:9"]
        app.launch()

        XCTAssert(reserved.waitForExistence(timeout: 5), "the saved week shows")
        let offline = app.buttons["offline"].firstMatch
        XCTAssert(offline.waitForExistence(timeout: 20), "the pill says the server is gone")
        shot("offline-week")
        tab("Ещё")
        shot("offline-more")
        tab("Главная")

        offline.tap()
        XCTAssert(sheet("server-sheet").waitForExistence(timeout: 5))
        shot("offline-server")
        app.buttons["Сменить сервер"].tap()
        let address = app.textFields.firstMatch
        XCTAssert(address.waitForExistence(timeout: 5))
        address.tap()
        address.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (address.value as? String ?? "").count))
        address.typeText(server)
        shot("offline-switch")
        app.buttons["Подключить"].tap()
        XCTAssert(sheet("server-sheet").waitForNonExistence(timeout: 15), "the new server is kept")
        XCTAssert(offline.waitForNonExistence(timeout: 15), "the screens load from it")
        shot("offline-back")
    }

    func testLogin() throws {
        app.terminate()
        app.launchArguments = ["-server", ""]
        app.launch()
        XCTAssert(app.buttons["Войти"].waitForExistence(timeout: 10))
        shot("login")
    }

    /// A choice of a switch by its label, or by the start of it. Only one that can be tapped counts, and one named
    /// exactly wins, as «Доходы» of «Ещё» over a chip «Доходы 6» of the operations.
    private func pill(_ label: String) -> XCUIElement {
        for predicate in [NSPredicate(format: "label == %@", label), NSPredicate(format: "label BEGINSWITH %@", label)] {
            let matches = app.buttons.matching(predicate)
            _ = matches.firstMatch.waitForExistence(timeout: 5)
            if let pill = matches.allElementsBoundByIndex.first(where: { $0.isHittable }) { return pill }
        }
        return app.buttons[label]
    }

    /// Opens the week's spending from today's spending under the circle; the first expense of it.
    private func openWeekSpending() -> XCUIElement {
        app.buttons["spent"].tap()
        return app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
    }

    /// A sheet or a part of a screen by its identifier.
    private func sheet(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    /// Back from a pushed page of the main page.
    private func back() {
        app.navigationBars.buttons.firstMatch.tap()
        sleep(1)
    }

    private func tab(_ title: String) {
        app.buttons["tab-\(title)"].tap()
        sleep(1)
    }

    private func shot(_ name: String) {
        sleep(1)
        count += 1
        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder {
            try? screenshot.pngRepresentation.write(to: folder.appending(path: String(format: "%02d-%@.png", count, name)))
        }
    }
}
