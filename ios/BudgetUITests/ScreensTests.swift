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

        // A week past its amount tells why from its red figure: what changed, expenses to check and reminders, opened to
        // their rows.
        let why = app.buttons["week-why"]
        if why.exists {
            why.tap()
            if app.descendants(matching: .any)["why-now"].waitForExistence(timeout: 10) {
                sleep(2)
                shot("week-why")
                // A purchase changed in the app opens its form.
                let change = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'change-purchase-'")).firstMatch
                if change.exists {
                    change.tap()
                    if sheet("purchase-sheet").waitForExistence(timeout: 5) { shot("week-why-change") }
                    app.buttons["Отмена"].tap()
                }
                for id in ["remind-optional", "remind-plan"] where app.buttons[id].exists { app.buttons[id].tap() }
                shot("week-why-reminders")
                app.swipeUp()
                shot("week-why-more")
            } else {
                XCTFail("why the week went below zero opens")
            }
            tab("Главная")
            XCTAssert(reserved.wait(for: \.isHittable, toEqual: true, timeout: 5), "«Главная» returns to the main page")
        }

        // With every expense sorted, the extras' card opens their page: what is free, the bar and the plan; «Подробнее»
        // the expenses, spent by the plan and without one.
        let extras = app.buttons["extras"]
        if extras.exists {
            extras.tap()
            XCTAssert(app.descendants(matching: .any)["extras-free"].waitForExistence(timeout: 10), "the extras open")
            sleep(1)
            shot("extras")
            app.buttons["extras-details"].tap()
            XCTAssert(app.descendants(matching: .any)["extras-details-free"].waitForExistence(timeout: 10), "the details open")
            sleep(1)
            shot("extras-details")
            app.swipeUp()
            shot("extras-details-more")
            app.buttons["extras-month"].tap()
            if app.buttons["Ноябрь 2026"].waitForExistence(timeout: 5) {
                shot("extras-months")
                app.buttons["Ноябрь 2026"].tap()
                sleep(2)
                shot("extras-details-ahead")
            }
            app.navigationBars.buttons.firstMatch.tap()
            if app.buttons["extras-next"].waitForExistence(timeout: 5) {
                app.buttons["extras-next"].tap()
                sleep(2)
                shot("extras-ahead")
            }
            tab("Главная")
            XCTAssert(reserved.wait(for: \.isHittable, toEqual: true, timeout: 5), "«Главная» returns to the main page")
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
        // What is paid already waits folded at the end.
        let paid = app.buttons["plan-paid"]
        if paid.exists {
            paid.tap()
            sleep(1)
            app.swipeUp()
            shot("plan-paid")
        }
        tab("Главная")
        XCTAssert(reserved.waitForExistence(timeout: 5), "«Главная» shows the main page")

        tab("Желания")
        if app.buttons["Месяцы"].waitForExistence(timeout: 10) {
            sleep(2)
            shot("wishes")
            app.buttons["Месяцы"].tap()
            sleep(1)
            shot("wishes-months")
            app.buttons["Карточки"].tap()
        } else {
            XCTFail("«Желания» open")
        }
        tab("Главная")

        // A week just begun has no spending yet, so the expense's sheet waits for a later walk.
        let expense = openWeekSpending()
        let spent = expense.waitForExistence(timeout: 10)
        shot("week-spending")
        if spent {
            expense.tap()
            if sheet("marking").waitForExistence(timeout: 10) {
                shot("spending")
                app.buttons["plan"].tap()
                shot("spending-payment")
                app.buttons["plan"].tap()
                app.buttons["place"].tap()
                shot("spending-places")
                app.buttons["place"].tap()
                unfoldMore()
                shot("spending-unfolded")
                app.swipeUp()
                shot("spending-more")
                // The shop leaves for the shop on «Ещё», whose form is left with «Отмена».
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
        // The month's extras open their page too.
        let monthExtras = app.buttons["month-extras"]
        if monthExtras.waitForExistence(timeout: 5) {
            monthExtras.tap()
            if app.descendants(matching: .any)["extras-free"].waitForExistence(timeout: 10) { shot("month-extras") }
            app.navigationBars.buttons.firstMatch.tap()
            sleep(1)
        }
        app.swipeDown()
        app.buttons["Неделя"].firstMatch.tap()
        sleep(1)

        tab("Операции")
        XCTAssert(app.buttons["categories"].waitForExistence(timeout: 10), "operations load")
        shot("operations")
        // The list goes by category and back by day.
        app.buttons["regroup"].tap()
        sleep(2)
        shot("operations-by-category")
        app.buttons["regroup"].tap()
        sleep(1)
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
        // An expense waiting for a category opens among the others that wait: «1 из 3».
        let waiting = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        if waiting.waitForExistence(timeout: 3) {
            waiting.tap()
            if sheet("marking").waitForExistence(timeout: 10) {
                shot("pending-sheet")
                app.buttons["Готово"].tap()
            } else {
                XCTFail("the expense waiting for a category opens")
            }
        }
        app.buttons["filter-Доходы"].tap()
        sleep(2)
        shot("operations-income")
        let income = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'spending-'")).firstMatch
        if income.waitForExistence(timeout: 5) {
            income.tap()
            if sheet("marking").waitForExistence(timeout: 10) {
                shot("income-sheet")
                app.buttons["more"].tap()
                shot("income-sheet-toggled")
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

    /// Opens «Желания», where credit cards come first, the first of them with its plan, and the new wish's form with
    /// «Кредитка» picked. It only opens and closes.
    func testCards() throws {
        XCTAssert(app.buttons["reserved"].waitForExistence(timeout: 15))
        tab("Желания")
        let cards = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'wish-card-'"))
        XCTAssert(cards.firstMatch.waitForExistence(timeout: 10), "the wishes load")
        sleep(1)
        shot("cards")
        // The first two, which are cards when there are any, as cards come first.
        for index in 0..<min(2, cards.count) {
            cards.element(boundBy: index).tap()
            guard app.buttons["Готово"].waitForExistence(timeout: 10) else { continue }
            sleep(2)
            shot("card-\(index + 1)")
            app.swipeUp()
            shot("card-\(index + 1)-more")
            app.buttons["Готово"].firstMatch.tap()
            sleep(1)
        }
        app.buttons["Добавить желание"].firstMatch.tap()
        if app.buttons["Кредитка"].waitForExistence(timeout: 5) {
            app.buttons["Кредитка"].tap()
            sleep(1)
            shot("card-new")
        }
    }

    /// Picks two ways for the first wish, the weeks by hand and the extras for the rest, chooses the plan and takes it back.
    /// It changes data, so it runs only against a server with copied databases: TEST_RUNNER_WISHES=1.
    func testWishPlan() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["WISHES"] == "1", "changes data: only against a copy")
        XCTAssert(app.buttons["reserved"].waitForExistence(timeout: 15))
        tab("Желания")
        let wish = app.buttons["wish-card-1"]
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
        app.buttons["wish-card-1"].tap()
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

        unfoldMore()
        // The category it had, to go back to: its tile, ZenMoney's too, or none.
        let tiles = sheet("marking").buttons
        let had = tiles.matching(NSPredicate(format: "selected == true")).firstMatch
        let hadLabel = had.exists ? had.label : nil
        let other = hadLabel?.hasPrefix("Продукты") == true ? "Дом" : "Продукты"
        let tile = tiles.matching(NSPredicate(format: "label BEGINSWITH %@", other)).firstMatch
        reveal(tile)
        tile.tap()
        shot("marking-category")
        XCTAssert(tile.waitForNonExistence(timeout: 5), "a pick folds the categories away")
        XCTAssert(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", other)).firstMatch.waitForExistence(timeout: 5), "the category shows in its line")
        shot("marking-folded")
        unfoldMore()
        if let hadLabel {
            let back = tiles.matching(NSPredicate(format: "label == %@", hadLabel)).firstMatch
            reveal(back)
            back.tap()
        } else {
            let undo = app.buttons["Убрать категорию"]
            reveal(undo)
            undo.tap()
        }
        app.swipeDown()
        sleep(1)
        shot("marking-category-undone")

        app.buttons["plan"].tap()
        shot("marking-payments")
        let card = sheet("marking").buttons.matching(identifier: "payment").firstMatch
        // The cards fade in one after another when they unfold.
        wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: card)], timeout: 5)
        card.tap()
        XCTAssert(card.waitForNonExistence(timeout: 5), "a pick folds the payments away")
        XCTAssert(stepSays("plan-step", "Изменить"), "the payment shows in its line")
        shot("marking-payment")
        app.buttons["plan"].tap()
        let unlink = app.buttons["Отвязать"]
        if unlink.waitForExistence(timeout: 5) { unlink.tap() }
        XCTAssert(stepSays("plan-step", "Связать"), "and it is unlinked")
        shot("marking-payment-undone")

        let description = sheet("description")
        description.tap()
        description.typeText("Проверка описания")
        // Sent once typing pauses, with nothing more pressed.
        XCTAssert(sheet("description-kept").waitForExistence(timeout: 5), "the description is sent on a pause")
        description.typeText("\n")
        shot("marking-description")
        // Could it have been done without: the switch turns at once, and the server keeps it.
        unfoldMore()
        let optional = app.switches["optional"]
        // The switch is at the end of its card; its name before it does not turn it.
        let flip = { optional.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        // The expense may be marked so already; the test turns it and back.
        XCTAssert(optional.waitForExistence(timeout: 5))
        reveal(optional)
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
        unfoldMore()
        reveal(optional)
        XCTAssertEqual(switched(optional, to: after), .completed, "the server kept it")
        flip()
        XCTAssertEqual(switched(optional, to: before), .completed, "and it turns back")
        app.swipeDown()
        // At the end of the text, so the deletes take all of it.
        description.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        description.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Проверка описания".count) + "\n")
        sleep(1)
        XCTAssert(["", "Например, обед"].contains(description.value as? String ?? ""), "the description is taken away")

        let extra = countIn("Дополнительные")
        XCTAssert(extra.waitForNonExistence(timeout: 5), "a pick folds the other places away")
        XCTAssert(stepSays("place-step", "Вернуть в неделю"), "an expense moved out of the week can go back")
        shot("marking-extra")
        app.buttons["place-step"].tap()
        XCTAssert(stepSays("place-step", "Перенести"), "and it is back in the week")
    }

    /// Waits for the step of a line of the open expense to begin with `words`.
    private func stepSays(_ identifier: String, _ words: String) -> Bool {
        let step = app.buttons[identifier]
        let says = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label BEGINSWITH %@", words), object: step)
        return XCTWaiter.wait(for: [says], timeout: 5) == .completed
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

    /// Scrolls the open expense up until `element` can be touched, as what is under the unfolded categories.
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<5 where !element.isHittable { app.swipeUp() }
    }

    /// Unfolds «Категория и другие настройки» of the open expense, unless they are unfolded.
    private func unfoldMore() {
        let more = app.buttons["more"]
        XCTAssert(more.waitForExistence(timeout: 5))
        if more.value as? String != "открыто" { more.tap() }
        let open = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "открыто"), object: more)
        XCTAssertEqual(XCTWaiter.wait(for: [open], timeout: 5), .completed, "the settings unfold")
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
