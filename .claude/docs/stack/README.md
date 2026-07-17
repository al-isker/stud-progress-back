# Стек

## Фреймворк

- NestJS 10 (`@nestjs/*`) на Express.
- Node.js, TypeScript 5.

## БД

- Prisma 5 (`@prisma/client`) — ORM для `PostgreSQL`.

## Авторизация

- `@nestjs/jwt` + `passport-jwt` — JWT-авторизация.

## Внешние интеграции

- `expo-server-sdk` — push-уведомления для Expo-клиентов.

## Валидация

- `class-validator` + `class-transformer` — валидация и трансформация DTO.

## Инфраструктура

- `@nestjs/config` — управление конфигурацией и environments.
- `@nestjs/schedule` — cron-задачи.
- `@nestjs/swagger` — документация REST API.
- `nestjs-pino` — логирование.

## Инструменты разработки

- `prettier` + `@trivago/prettier-plugin-sort-imports` — форматирование кода.
- `eslint` — анализ кода.
- `jest` + `ts-jest` — тестирование кода.
