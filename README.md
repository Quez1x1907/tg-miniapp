# tg-miniapp 🛰

Mini App для Telegram — пульт управления ИИ-агентом [antigravity-engine](https://github.com/Quez1x1907/antigravity-engine):
запуск задач, статусы в реальном времени, логи, история запусков.

## Как это работает

- Фронт хостится на **GitHub Pages** (статика, бесплатно).
- Задачи запускаются через GitHub API (`workflow_dispatch`) в репо движка —
  вся тяжёлая работа крутится в GitHub Actions (16 ГБ RAM).
- **Доступ только у владельца:** Mini App передаёт подписанный Telegram `initData`,
  агент в workflow проверяет подпись (HMAC секретом бота) и Telegram ID.
- **Токен не хранится в открытом виде:** при первом входе вводится fine-grained
  PAT (только `Actions: RW` на репо движка, 90 дней), он шифруется паролем
  (AES-256-GCM, PBKDF2 310k) и лежит в localStorage устройства. Пароль никуда
  не отправляется. Автоблокировка через 10 минут неактивности.
- Секретов в коде нет — бандл публичный и безопасный.

## Первый запуск

1. Создай fine-grained PAT: GitHub → Settings → Developer settings →
   Fine-grained tokens → Repository access: только `antigravity-engine`,
   Permissions: **Actions: Read and write**.
2. Открой Mini App из Telegram (Menu Button у бота).
3. Введи PAT и придумай пароль — дальше вход только по паролю.

## Разработка

```bash
npm install
npm run dev      # локально (initData не будет — dispatch отклонится)
npm run build    # typecheck + сборка
```

Деплой автоматический: push в `main` → Pages.

## Структура

- `src/lib/vault.ts` — шифрование/хранение PAT, автоблокировка
- `src/lib/gh.ts` — GitHub API: dispatch, статусы, логи, артефакты
- `src/lib/tma.ts` — Telegram Mini App: initData, проверка владельца
- `src/components/Gate.tsx` — экраны первого входа / блокировки
- `src/App.tsx` — вкладки: Задача / Статус / История
