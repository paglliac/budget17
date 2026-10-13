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

        // With every expense sorted, the extras' card opens the month on them.
        let extras = app.buttons["extras"]
        if extras.exists {
            extras.tap()
            XCTAssert(app.buttons["Добавить в дополнительные"].waitForExistence(timeout: 10), "the month opens")
            sleep(1)
            shot("month-extras")
            pill("Неделя").tap()
            XCTAssert(reserved.waitForExistence(timeout: 5), "«Неделя» brings the week back")
        }

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
            // The plan opens on the week the main page shows.
            reserved.tap()
            XCTAssert(app.buttons["tab-План"].wait(for: \.isSelected, toEqual: true, timeout: 5), "«Зарезервировано» opens the plan tab")
            sleep(2)
            shot("plan-past")
            // Both pages have «Сейчас» now, so the one on screen.
            pill("Сейчас").tap()
            tab("Главная")
            pill("Сейчас").tap()
            sleep(2)
        } else {
            XCTFail("the week picker opens")
        }

        reserved.tap()
        XCTAssert(app.buttons["tab-План"].wait(for: \.isSelected, toEqual: true, timeout: 5), "«Зарезервировано» opens the plan tab")
        shot("plan")
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
        shot("plan-more")
        tab("Главная")
        XCTAssert(reserved.waitForExistence(timeout: 5), "«Главная» shows the main page")

        app.buttons["tab-add"].tap()
        let toExtras = app.buttons["В дополнительные"]
        if toExtras.waitForExistence(timeout: 5) {
            shot("add-menu")
            toExtras.tap()
            if sheet("purchase-sheet").waitForExistence(timeout: 10) { shot("add-purchase") }
            app.buttons["Отмена"].tap()
        } else {
            XCTFail("the «+» of the tab bar opens its menu")
        }

        // A week just begun has no spending yet, so the expense's sheet waits for a later walk.
        let expense = openWeekSpending()
        let spent = expense.waitForExistence(timeout: 10)
        shot("week-spending")
        if spent {
            expense.tap()
            if sheet("marking").waitForExistence(timeout: 10) {
                shot("spending")
                unfold()
                shot("spending-unfolded")
                app.buttons["Платёж"].tap()
                shot("spending-payment")
                app.swipeUp()
                shot("spending-more")
                // The shop's name leaves for the shop on «Ещё», whose form is left with «Отмена».
                app.swipeDown()
                let shop = app.buttons["shop"]
                if shop.waitForExistence(timeout: 2) {
                    shop.tap()
                    if app.buttons["Сохранить"].waitForExistence(timeout: 5) {
                        shot("shop")
                    } else {
                        XCTFail("the shop's name opens the shop")
                    }
                    app.buttons["Отмена"].tap()
                    shot("shops-opened")
                    tab("Главная")
                } else {
                    app.buttons["Готово"].tap()
                }
            } else {
                XCTFail("the expense opens")
            }
        }
        // The open «Главная» brings the main page back from a page opened over it.
        tab("Главная")
        XCTAssert(reserved.wait(for: \.isHittable, toEqual: true, timeout: 5), "«Главная» returns to the main page")

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
        // The expenses that could have been done without have a filter once one is marked so.
        let optional = app.buttons["filter-Необязательные"]
        if optional.exists {
            // It is the last of the filters, past the edge of the screen.
            let from = app.buttons["filter-Доходы"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: -240, dy: 0)))
            optional.tap()
            sleep(2)
            shot("operations-optional")
            let back = optional.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            back.press(forDuration: 0.05, thenDragTo: back.withOffset(CGVector(dx: 240, dy: 0)))
        }
        app.buttons["filter-Все"].tap()

        tab("Ещё")
        pill("Регулярные").tap()
        sleep(1)
        shot("regular")
        pill("Доходы").tap()
        sleep(1)
        shot("income")
        pill("Категории").tap()
        sleep(1)
        shot("categories")
        let category = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "category-")).firstMatch
        if category.waitForExistence(timeout: 5) {
            category.tap()
            if app.buttons["form-save"].waitForExistence(timeout: 5) {
                shot("category")
                app.swipeUp()
                shot("category-colors")
                app.buttons["Отмена"].firstMatch.tap()
            }
        }
        pill("Магазины").tap()
        sleep(1)
        shot("shops")
        app.buttons["Настройки"].tap()
        if sheet("settings").waitForExistence(timeout: 5) {
            sleep(1)
            shot("settings")
            app.buttons["Готово"].tap()
        }
    }

    /// Picks two ways for the first wish, the weeks by hand and the extras for the rest, chooses the plan and takes it back.
    /// It changes data, so it runs only against a server with copied databases: TEST_RUNNER_WISHES=1.
    func testWishPlan() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["WISHES"] == "1", "changes data: only against a copy")
        let reserved = app.buttons["reserved"]
        XCTAssert(reserved.waitForExistence(timeout: 15))
        reserved.tap()
        sleep(2)
        app.swipeUp()
        app.swipeUp()
        let wish = app.buttons["wish-1"]
        XCTAssert(wish.waitForExistence(timeout: 5))
        shot("wishes")
        wish.tap()
        XCTAssert(app.buttons["way-weeks"].waitForExistence(timeout: 10))
        shot("wish")
        app.buttons["way-weeks"].tap()
        sleep(2)
        app.swipeUp()
        app.sliders["slider-weeks"].adjust(toNormalizedSliderPosition: 0.25)
        sleep(2)
        shot("wish-weeks")
        app.swipeDown()
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'way-extra-'")).firstMatch.tap()
        sleep(2)
        shot("wish-weeks-extras")
        app.buttons["Выбрать"].tap()
        sleep(2)
        app.swipeUp()
        app.swipeUp()
        shot("wish-chosen")
        app.buttons["Готово"].firstMatch.tap()
        sleep(1)
        shot("wishes-chosen")
        app.buttons["wish-1"].tap()
        XCTAssert(app.buttons["Отменить"].waitForExistence(timeout: 10))
        app.buttons["Отменить"].tap()
        sleep(2)
        shot("wish-unchosen")
        app.buttons["Готово"].firstMatch.tap()
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
        // Could it have been done without: the switch turns at once, and the server keeps it.
        let optional = app.switches["optional"]
        // The switch is at the end of its card; its name before it does not turn it.
        let flip = { optional.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        // The expense may be marked so already; the test turns it and back.
        XCTAssert(optional.waitForExistence(timeout: 5))
        let before = optional.value as? String == "1" ? "1" : "0"
        let after = before == "1" ? "0" : "1"
        flip()
        XCTAssertEqual(switched(optional, to: after), .completed, "the switch turns")
        sleep(1)
        shot("marking-optional")
        app.buttons["Готово"].tap()
        XCTAssert(sheet("marking").waitForNonExistence(timeout: 5))
        expense.tap()
        XCTAssert(description.waitForExistence(timeout: 10))
        XCTAssertEqual(description.value as? String, "Проверка описания", "the description is kept")
        XCTAssertEqual(switched(optional, to: after), .completed, "the server kept it")
        flip()
        XCTAssertEqual(switched(optional, to: before), .completed, "and it turns back")
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

    /// Waits for a switch to show on (1) or off (0).
    private func switched(_ element: XCUIElement, to value: String) -> XCTWaiter.Result {
        XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: element)], timeout: 5)
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
