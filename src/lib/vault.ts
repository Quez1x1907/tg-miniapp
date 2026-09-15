/**
 * Безопасное локальное хранение PAT: шифрование паролем.
 * AES-256-GCM, ключ из PBKDF2 (310k итераций, SHA-256, случайная соль).
 * Пароль НИКУДА не отправляется и не хранится — проверка только по факту
 * успешной расшифровки (GCM сам падает при неверном ключе).
 */

const PBKDF2_ITERATIONS = 310_000;
const STORE_KEY = 'tma_vault_v1';
const AUTOLOCK_MS = 10 * 60 * 1000;

interface VaultRecord {
  v: 1;
  salt: string;      // base64
  iv: string;        // base64
  ct: string;        // base64 — зашифрованный PAT
  createdAt: number;
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function subtle(): SubtleCrypto {
  if (!crypto?.subtle) {
    // Telegram WebView на http (не https) может не давать crypto.subtle.
    // Pages отдаёт https, поэтому здесь оказываемся только в dev без https.
    throw new Error('WebCrypto недоступен: открой Mini App по https');
  }
  return crypto.subtle;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function vaultSetup(password: string, pat: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(pat),
  );
  const rec: VaultRecord = {
    v: 1,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
    createdAt: Date.now(),
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(rec));
}

export async function vaultUnlock(password: string): Promise<string> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) throw new Error('Хранилище не инициализировано');
  const rec = JSON.parse(raw) as VaultRecord;
  const key = await deriveKey(password, unb64(rec.salt));
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: unb64(rec.iv) },
      key,
      unb64(rec.ct),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Неверный пароль');
  }
}

export function vaultExists(): boolean {
  return localStorage.getItem(STORE_KEY) !== null;
}

export function vaultReset(): void {
  localStorage.removeItem(STORE_KEY);
}

/** Сколько PAT хранится (в днях) — напомнить обновить до истечения 90 дней. */
export function vaultAgeDays(): number {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return 0;
  try {
    const rec = JSON.parse(raw) as VaultRecord;
    return Math.floor((Date.now() - rec.createdAt) / 86_400_000);
  } catch {
    return 0;
  }
}

/** Автоблокировка по неактивности. */
let lockTimer: ReturnType<typeof setTimeout> | null = null;
const lockListeners = new Set<() => void>();

export function onLock(cb: () => void): () => void {
  lockListeners.add(cb);
  return () => lockListeners.delete(cb);
}

export function armAutolock(): void {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    lockListeners.forEach((cb) => cb());
  }, AUTOLOCK_MS);
}

export function disarmAutolock(): void {
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}
