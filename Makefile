# Команды проекта; `make` без аргументов показывает список.

DB := data/zenmoney.db

.DEFAULT_GOAL := help
.PHONY: help install sync balances web claude-review resync pull-data restore-data test typecheck ios-check ios-install android-check android-install check

help: ## Список команд
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-15s %s\n", $$1, $$2}'

install: ## Установить зависимости
	npm install

sync: ## Загрузить изменения из ZenMoney в локальную базу
	@npm run --silent sync

balances: ## Синхронизация, затем счета и итоговый баланс
	@npm run --silent balances

web: ## Веб-интерфейс: обзор и виджеты на localhost:4317
	@npm run --silent web

claude-review: ## Claude по подписке разбирает месяц: MONTH=2026-09 или о чём просили на странице, WATCH=1 — ждать просьб, SERVER=…
	@npm run --silent claude-review -- --server $(or $(SERVER),http://localhost:4317) $(if $(MONTH),--month $(MONTH)) $(if $(WATCH),--watch)

resync: ## Удалить копию ZenMoney и скачать всё заново (регулярные траты остаются)
	rm -f $(DB)
	@npm run --silent sync

pull-data: ## Базы с сервера budget.gang.su в data/ этой копии (VDS=… — другой ssh-хост)
	@VDS=$(VDS) scripts/pull-data.sh

restore-data: ## Снимок баз из .scratch в data/ этой копии, даты — на сегодня (DATASET=week-minus/2026-10-14, TODAY=…)
	@node scripts/restore-data.ts $(if $(DATASET),--dataset $(DATASET)) $(if $(TODAY),--today $(TODAY))

test: ## Тесты
	npm test

typecheck: ## Проверка типов
	npm run typecheck

ios-check: ## Приложение для iPhone: собирается и читает JSON сервера
	@ios/check.sh

ios-install: ## Поставить приложение на iPhone (и переподписать раз в 7 дней)
	@ios/install.sh

android-check: ## Приложение для Android: собирается и читает JSON сервера
	@android/check.sh

android-install: ## Поставить приложение на Android-телефон, подключённый кабелем
	@android/install.sh

check: test typecheck ios-check android-check ## Тесты, проверка типов и приложения для iPhone и Android
