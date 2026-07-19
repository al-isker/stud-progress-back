# Корпус фикстур `test-document-parser`

Документы для единственного интеграционного теста модуля
(`../parse-test-document.spec.ts`). Тест сам находит все кейсы — добавление
нового кейса не требует правок кода.

## Раскладка

Каждый кейс — отдельная папка внутри `valid/` или `invalid/`:

    fixtures/
    ├─ valid/
    │  └─ NNN/
    │     ├─ document.<ext>   # исходный документ
    │     ├─ README.md        # описание кейса (заполняется вручную)
    │     └─ expected.json    # ожидаемый результат парсинга
    └─ invalid/
       └─ NNN/
          ├─ document.<ext>    # исходный документ
          └─ README.md         # почему документ невалиден

## Что проверяет тест

- Кейс из `valid/` → `status: "valid"` и `document` точно равен `expected.json`.
- Кейс из `invalid/` → `status: "invalid"`.
