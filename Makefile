# Команды проекта; `make` без аргументов показывает список.

DB := data/zenmoney.db

.DEFAULT_GOAL := help
.PHONY: help install sync balances web resync test typecheck check

help: ## Список команд
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Установить зависимости
	npm install

sync: ## Загрузить изменения из ZenMoney в локальную базу
	@npm run --silent sync

balances: ## Синхронизация, затем счета и итоговый баланс
	@npm run --silent balances

web: ## Веб-интерфейс: обзор и виджеты на localhost:4317
	@npm run --silent web

resync: ## Удалить копию ZenMoney и скачать всё заново (регулярные траты остаются)
	rm -f $(DB)
	@npm run --silent sync

test: ## Тесты
	npm test

typecheck: ## Проверка типов
	npm run typecheck

check: test typecheck ## Тесты и проверка типов
