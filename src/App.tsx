import React, { useCallback, useEffect, useRef, useState } from 'react';
import Gate from './components/Gate';
import { getInitData, getTmaUser, isOwner, TmaUser } from './lib/tma';
import {
  dispatchTask,
  getRun,
  tailJobLog,
  listArtifacts,
  RunInfo,
  LogLine,
  ArtifactInfo,
} from './lib/gh';

type Tab = 'task' | 'status' | 'runs';

const TaskTab: React.FC<{ token: string; onStarted: (runId: number) => void }> = ({
  token,
  onStarted,
}) => {
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setOk('');
    if (task.trim().length < 3) return setErr('Опиши задачу');
    setBusy(true);
    try {
      const initData = getInitData();
      if (!initData) throw new Error('Нет initData — открой Mini App из Telegram');
      const runId = await dispatchTask(token, task.trim(), initData);
      setOk(`Запущено, run #${runId}`);
      setTask('');
      onStarted(runId);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <h2>Новая задача агенту</h2>
      <textarea
        placeholder="Что сделать? Например: «собери отчёт по репо X и закоммить в results/»"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        rows={6}
      />
      {err && <p className="err">{err}</p>}
      {ok && <p className="ok">{ok}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Запускаю…' : '▶ Запустить'}
      </button>
    </form>
  );
};

const StatusTab: React.FC<{ token: string; runId: number }> = ({ token, runId }) => {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [arts, setArts] = useState<ArtifactInfo[]>([]);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!runId) return;
    try {
      const r = await getRun(token, runId);
      setRun(r);
      if (r.status === 'in_progress' || r.status === 'queued') {
        setLogs(await tailJobLog(token, runId));
        setArts([]);
      } else {
        setLogs(await tailJobLog(token, runId));
        setArts(await listArtifacts(token, runId));
        if (timer.current) clearInterval(timer.current);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }, [token, runId]);

  useEffect(() => {
    if (!runId) return;
    refresh();
    timer.current = setInterval(refresh, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [runId, refresh]);

  if (!runId) return <div className="card hint">Запусти задачу или выбери из истории.</div>;

  const statusEmoji =
    run?.conclusion === 'success' ? '✅' : run?.conclusion === 'failure' ? '❌' : '⏳';

  return (
    <div className="card">
      <h2>
        {statusEmoji} Run #{runId}
      </h2>
      <p>
        Статус: <b>{run ? `${run.status}${run.conclusion ? ` / ${run.conclusion}` : ''}` : '…'}</b>
      </p>
      {run && (
        <p>
          <a href={run.html_url} target="_blank" rel="noreferrer">
            Открыть на GitHub ↗
          </a>
        </p>
      )}
      {arts.length > 0 && (
        <div>
          <h3>Артефакты</h3>
          <ul>
            {arts.map((a) => (
              <li key={a.id}>
                {a.name} ({Math.round(a.size / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <pre className="log">{logs.map((l) => l.text).join('\n') || 'лог появится здесь…'}</pre>
    </div>
  );
};

interface RunRow {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  display_title: string;
}

const RunsTab: React.FC<{ token: string; onSelect: (id: number) => void }> = ({ token, onSelect }) => {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          'https://api.github.com/repos/Quez1x1907/antigravity-engine/actions/workflows/agent.yml/runs?per_page=15',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
          },
        );
        if (!res.ok) throw new Error(`runs ${res.status}`);
        const data = (await res.json()) as { workflow_runs: RunRow[] };
        setRuns(data.workflow_runs);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : String(ex));
      }
    })();
  }, [token]);

  return (
    <div className="card">
      <h2>История запусков</h2>
      {err && <p className="err">{err}</p>}
      {runs.length === 0 && <p className="hint">Пока пусто.</p>}
      <ul className="runs">
        {runs.map((r) => (
          <li key={r.id} onClick={() => onSelect(r.id)}>
            <span>
              {r.conclusion === 'success' ? '✅' : r.conclusion === 'failure' ? '❌' : '⏳'} #
              {r.id} — {r.display_title || 'без названия'}
            </span>
            <small>{new Date(r.created_at).toLocaleString('ru-RU')}</small>
          </li>
        ))}
      </ul>
    </div>
  );
};

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('task');
  const [runId, setRunId] = useState(0);
  const [user] = useState<TmaUser | null>(() => getTmaUser());
  const [notOwner, setNotOwner] = useState(false);

  useEffect(() => {
    const u = getTmaUser();
    if (u && !isOwner(u)) setNotOwner(true);
    const w = window as unknown as { Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } } };
    w.Telegram?.WebApp?.ready?.();
    w.Telegram?.WebApp?.expand?.();
  }, []);

  if (notOwner) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>⛔ Доступ только для владельца</h2>
          <p className="hint">Это приватный пульт. Твой Telegram ID не в списке.</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="wrap">
        <Gate onUnlocked={setToken} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <h1>🛰 Antigravity</h1>
        {user && <span className="hint">@{user.username ?? user.id}</span>}
      </header>
      <nav>
        <button className={tab === 'task' ? 'active' : ''} onClick={() => setTab('task')}>
          Задача
        </button>
        <button className={tab === 'status' ? 'active' : ''} onClick={() => setTab('status')}>
          Статус
        </button>
        <button className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}>
          История
        </button>
      </nav>
      {tab === 'task' && (
        <TaskTab
          token={token}
          onStarted={(id) => {
            setRunId(id);
            setTab('status');
          }}
        />
      )}
      {tab === 'status' && <StatusTab token={token} runId={runId} />}
      {tab === 'runs' && (
        <RunsTab
          token={token}
          onSelect={(id) => {
            setRunId(id);
            setTab('status');
          }}
        />
      )}
      <footer className="hint">
        Токен зашифрован на устройстве · автоблокировка 10 мин
      </footer>
    </div>
  );
};

export default App;
