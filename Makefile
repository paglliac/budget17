# Команды проекта; `make` без аргументов показывает список.

DB := data/zenmoney.db

.DEFAULT_GOAL := help
.PHONY: help install sync balances resync prototype test typecheck check

help: ## Список команд
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Установить зависимости
	npm install

sync: ## Загрузить изменения из ZenMoney в локальную базу
	@npm run --silent sync

balances: ## Синхронизация, затем счета и итоговый баланс
	@npm run --silent balances

resync: ## Удалить локальную базу и скачать всё заново
	rm -f $(DB)
	@npm run --silent sync

prototype: ## Прототип интерфейса: варианты главного экрана на localhost:4317
	@npm run --silent prototype

test: ## Тесты
	npm test

typecheck: ## Проверка типов
	npm run typecheck

check: test typecheck ## Тесты и проверка типов
