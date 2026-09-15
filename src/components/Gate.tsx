import React, { useEffect, useState, useCallback } from 'react';
import {
  vaultExists,
  vaultSetup,
  vaultUnlock,
  vaultReset,
  vaultAgeDays,
  onLock,
  armAutolock,
  disarmAutolock,
  rememberSave,
  rememberLoad,
  rememberClear,
} from '../lib/vault';
import { checkToken } from '../lib/gh';

type Stage = 'loading' | 'setup' | 'lock' | 'error';

interface Props {
  onUnlocked: (token: string) => void;
}

const SetupForm: React.FC<{ onDone: (token: string) => void }> = ({ onDone }) => {
  const [pat, setPat] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pass1.length < 6) return setErr('Пароль: минимум 6 символов');
    if (pass1 !== pass2) return setErr('Пароли не совпадают');
    setBusy(true);
    try {
      const chk = await checkToken(pat.trim());
      if (!chk.ok) throw new Error(chk.reason ?? 'токен не принят');
      await vaultSetup(pass1, pat.trim());
      if (remember) rememberSave(pass1);
      onDone(pat.trim());
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <h2>Первый вход</h2>
      <p className="hint">
        Вставь fine-grained PAT (право <code>Actions: RW</code> на{' '}
        <code>antigravity-engine</code>) и придумай пароль. Токен будет зашифрован
        паролем и останется только на этом устройстве.
      </p>
      <input
        type="password"
        placeholder="github_pat_..."
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        autoComplete="off"
        required
      />
      <input
        type="password"
        placeholder="Пароль (мин. 6 символов)"
        value={pass1}
        onChange={(e) => setPass1(e.target.value)}
        autoComplete="new-password"
        required
      />
      <input
        type="password"
        placeholder="Повтори пароль"
        value={pass2}
        onChange={(e) => setPass2(e.target.value)}
        autoComplete="new-password"
        required
      />
      <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Запомнить пароль на этом устройстве (вход без пароля)
      </label>
      {err && <p className="err">{err}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Проверяю токен…' : 'Сохранить и войти'}
      </button>
    </form>
  );
};

const LockForm: React.FC<{ onUnlock: (token: string) => void; onReset: () => void }> = ({
  onUnlock,
  onReset,
}) => {
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const days = vaultAgeDays();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const token = await vaultUnlock(pass);
      if (remember) rememberSave(pass);
      onUnlock(token);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <h2>🔒 Заблокировано</h2>
      {days >= 75 && (
        <p className="warn">PAT старше {days} дн. — скоро истечение (90), обнови.</p>
      )}
      <input
        type="password"
        placeholder="Пароль"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        autoComplete="current-password"
        autoFocus
        required
      />
      <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Запомнить пароль на этом устройстве
      </label>
      {err && <p className="err">{err}</p>}
      <button type="submit" disabled={busy}>
        {busy ? '…' : 'Разблокировать'}
      </button>
      <button type="button" className="ghost" onClick={onReset}>
        Сбросить хранилище (ввести PAT заново)
      </button>
    </form>
  );
};

const Gate: React.FC<Props> = ({ onUnlocked }) => {
  const [stage, setStage] = useState<Stage>('loading');

  const handleUnlocked = useCallback(
    (token: string) => {
      armAutolock();
      onUnlocked(token);
    },
    [onUnlocked],
  );

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!vaultExists()) {
        setStage('setup');
        return;
      }
      const saved = rememberLoad();
      if (saved) {
        try {
          const token = await vaultUnlock(saved);
          if (!cancelled) {
            handleUnlocked(token);
            return;
          }
        } catch {
          rememberClear();
        }
      }
      if (!cancelled) setStage('lock');
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [handleUnlocked]);

  useEffect(() => {
    const un = onLock(() => {
      disarmAutolock();
      setStage('lock');
    });
    return un;
  }, []);

  if (stage === 'loading') return <div className="card">…</div>;
  if (stage === 'setup') return <SetupForm onDone={handleUnlocked} />;
  if (stage === 'lock')
    return (
      <LockForm
        onUnlock={handleUnlocked}
        onReset={() => {
          vaultReset();
          setStage('setup');
        }}
      />
    );
  return null;
};

export default Gate;
