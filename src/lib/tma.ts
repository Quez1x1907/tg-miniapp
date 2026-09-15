/**
 * Валидация initData на стороне Mini App — быстрая проверка до отправки
 * в workflow (финальная проверка подписи HMAC всё равно в агенте, т.к.
 * BOT_TOKEN не должен покидать секретов репо B).
 *
 * Здесь только: собрать данные из Telegram WebApp и отдачь их как есть.
 * Подпись на клиенте НЕ проверяем — секрета на клиенте быть не должно.
 */

export interface TmaUser {
  id: number;
  first_name?: string;
  username?: string;
}

export function getInitData(): string {
  const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } } };
  const raw = w.Telegram?.WebApp?.initData;
  if (!raw) {
    // dev-режим в обычном браузере: initData нет, dispatch всё равно отклонит агент
    return '';
  }
  return raw;
}

export function getTmaUser(): TmaUser | null {
  const w = window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { user?: TmaUser } } };
  };
  return w.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

/** ID владельца — единственный, кому разрешена работа с агентом. */
export const OWNER_TG_ID = 5485249627;

export function isOwner(u: TmaUser | null): boolean {
  return u?.id === OWNER_TG_ID;
}
