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
        let expense = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        XCTAssert(expense.waitForExistence(timeout: 15), "the week loads")
        shot("week")

        expense.tap()
        if app.descendants(matching: .any)["marking"].waitForExistence(timeout: 10) {
            shot("spending")
            app.buttons["Платёж"].tap()
            shot("spending-payment")
            app.swipeUp()
            shot("spending-more")
            app.buttons["Готово"].tap()
        } else {
            XCTFail("the expense opens")
        }

        app.buttons["week-limit"].tap()
        if app.buttons["Сохранить"].waitForExistence(timeout: 5) {
            shot("week-limit")
            app.buttons["Отмена"].tap()
        } else {
            XCTFail("the week's budget opens")
        }

        pill("План").tap()
        shot("week-plan")
        let addToPlan = app.buttons["Добавить в план"]
        if addToPlan.waitForExistence(timeout: 5) {
            // A long plan puts it at the bottom edge, under the tab bar.
            app.swipeUp()
            addToPlan.tap()
            if app.navigationBars["Новая покупка"].waitForExistence(timeout: 5) { shot("purchase-new") }
            app.buttons["Отмена"].tap()
        }
        pill("Хочу").tap()
        shot("week-wishes")

        // Dragging the band up gives the sheet the summary's room, down gives it back.
        let band = app.descendants(matching: .any)["band"].firstMatch
        let middle = band.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
        middle.press(forDuration: 0.1, thenDragTo: middle.withOffset(CGVector(dx: 0, dy: -200)))
        XCTAssert(app.buttons["Раньше"].exists && !app.staticTexts["Окт"].exists, "the band drags the sheet over the summary")
        shot("week-expanded")
        let raised = band.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
        raised.press(forDuration: 0.1, thenDragTo: raised.withOffset(CGVector(dx: 0, dy: 200)))

        app.buttons["Месяц"].tap()
        sleep(2)
        shot("month")
        pill("Дополнительные").tap()
        shot("month-extras")

        app.buttons["Добавить"].tap()
        shot("add-menu")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()

        tab("Операции")
        XCTAssert(app.buttons["categories"].waitForExistence(timeout: 10), "operations load")
        shot("operations")
        app.buttons["categories"].tap()
        if app.navigationBars["Расходы по категориям"].waitForExistence(timeout: 5) {
            shot("categories-spending")
            app.buttons["Готово"].tap()
        }
        app.buttons["Найти"].tap()
        shot("operations-search")
        app.buttons["Отмена"].tap()

        tab("Разобрать")
        shot("uncategorized")
        pill("Разобрано").tap()
        shot("uncategorized-sorted")

        tab("Ещё")
        shot("regular")
        pill("Доходы").tap()
        sleep(1)
        shot("income")
        pill("Категории").tap()
        sleep(1)
        shot("categories")
        app.buttons["Настройки"].tap()
        if app.navigationBars["Настройки"].waitForExistence(timeout: 5) {
            sleep(1)
            shot("settings")
            app.buttons["Готово"].tap()
        }
    }

    /// Marks an expense and takes it back: a category, a payment and where it counts. It changes data, so it runs only
    /// against a server with copied databases: TEST_RUNNER_MARKING=1.
    func testMarking() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["MARKING"] == "1", "changes data: only against a copy")
        let expense = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        XCTAssert(expense.waitForExistence(timeout: 15))
        expense.tap()
        XCTAssert(app.descendants(matching: .any)["marking"].waitForExistence(timeout: 10))
        shot("marking-before")

        let tile = app.descendants(matching: .any)["marking"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Продукты'")).firstMatch
        tile.tap()
        shot("marking-category")
        XCTAssert(app.staticTexts["категория"].waitForExistence(timeout: 5), "the category shows on top")
        let undo = app.buttons["Убрать категорию"]
        if undo.waitForExistence(timeout: 5) { undo.tap() }
        sleep(1)
        shot("marking-category-undone")

        app.buttons["Платёж"].tap()
        let card = app.descendants(matching: .any)["marking"].buttons.matching(NSPredicate(format: "label CONTAINS 'руб.'")).firstMatch
        card.tap()
        XCTAssert(app.staticTexts["оплатила платёж"].waitForExistence(timeout: 5), "the payment shows on top")
        shot("marking-payment")
        let unlink = app.buttons["Отвязать"]
        if unlink.waitForExistence(timeout: 5) { unlink.tap() }
        sleep(1)
        shot("marking-payment-undone")

        app.descendants(matching: .any)["marking"].buttons.matching(NSPredicate(format: "label == 'Дополнительные'")).firstMatch.tap()
        XCTAssert(app.staticTexts["в дополнительных"].waitForExistence(timeout: 5))
        shot("marking-extra")
        app.descendants(matching: .any)["marking"].buttons.matching(NSPredicate(format: "label == 'Неделя'")).firstMatch.tap()
        XCTAssert(app.staticTexts["в неделе"].waitForExistence(timeout: 5))
    }

    /// Loads the screens from the server, opens the app again with a server that is gone, and switches back to the
    /// working one from the pill. It reads only, so it runs against real data.
    func testOffline() throws {
        let expense = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        XCTAssert(expense.waitForExistence(timeout: 15), "the week loads")
        sleep(2)
        app.terminate()
        let server = app.launchArguments[1]
        app.launchArguments = ["-server", "http://localhost:9"]
        app.launch()

        XCTAssert(expense.waitForExistence(timeout: 5), "the saved week shows")
        let offline = app.buttons["offline"].firstMatch
        XCTAssert(offline.waitForExistence(timeout: 20), "the pill says the server is gone")
        shot("offline-week")
        tab("Ещё")
        shot("offline-more")
        tab("Бюджет")

        offline.tap()
        XCTAssert(app.navigationBars["Сервер"].waitForExistence(timeout: 5))
        shot("offline-server")
        app.buttons["Сменить сервер"].tap()
        let address = app.textFields.firstMatch
        XCTAssert(address.waitForExistence(timeout: 5))
        address.tap()
        address.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (address.value as? String ?? "").count))
        address.typeText(server)
        shot("offline-switch")
        app.buttons["Подключить"].tap()
        XCTAssert(app.navigationBars["Сервер"].waitForNonExistence(timeout: 15), "the new server is kept")
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

    /// A pill of the band by its label, or by the start of it, as «План 7». Hidden screens keep their pills, so only
    /// one that can be tapped counts, and one named exactly wins, as «Доходы» of «Ещё» over «Доходы 6» of operations.
    private func pill(_ label: String) -> XCUIElement {
        for predicate in [NSPredicate(format: "label == %@", label), NSPredicate(format: "label BEGINSWITH %@", label)] {
            let matches = app.buttons.matching(predicate)
            _ = matches.firstMatch.waitForExistence(timeout: 5)
            if let pill = matches.allElementsBoundByIndex.first(where: { $0.isHittable }) { return pill }
        }
        return app.buttons[label]
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
