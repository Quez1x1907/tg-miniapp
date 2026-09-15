/**
 * Клиент GitHub API: запуск antigravity-engine и чтение результатов.
 * Токен передаётся с устройства владельца, в бандле его нет.
 */

const OWNER = 'Quez1x1907';
const ENGINE_REPO = 'antigravity-engine';
const WORKFLOW_FILE = 'agent.yml';
const API = 'https://api.github.com';

export function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** Проверка токена + что он может запускать workflow в репо движка. */
export async function checkToken(token: string): Promise<{ login: string; ok: boolean; reason?: string }> {
  const u = await fetch(`${API}/user`, { headers: ghHeaders(token) });
  if (!u.ok) return { login: '', ok: false, reason: `токен отклонён GitHub (${u.status})` };
  const { login } = (await u.json()) as { login: string };
  if (login !== OWNER) return { login, ok: false, reason: `токен от ${login}, а нужен от ${OWNER}` };
  const w = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/workflows/${WORKFLOW_FILE}`,
    { headers: ghHeaders(token) },
  );
  if (!w.ok) return { login, ok: false, reason: `нет доступа к ${ENGINE_REPO} (${w.status})` };
  return { login, ok: true };
}

/** Dispatch: запуск задачи. Возвращает run id для отслеживания. */
export async function dispatchTask(
  token: string,
  task: string,
  initData: string,
): Promise<number> {
  // validated initData уходит в workflow как input — агент проверит подпись на своей стороне
  const res = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: { task, initData },
      }),
    },
  );
  if (res.status !== 204) {
    const t = await res.text();
    throw new Error(`dispatch failed ${res.status}: ${t.slice(0, 200)}`);
  }
  // dispatch асинхронный — берём самый свежий run этого workflow
  await new Promise((r) => setTimeout(r, 1500));
  const runs = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
    { headers: ghHeaders(token) },
  );
  if (!runs.ok) throw new Error(`runs failed ${runs.status}`);
  const data = (await runs.json()) as { workflow_runs: Array<{ id: number }> };
  return data.workflow_runs[0]?.id ?? 0;
}

export interface RunInfo {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export async function getRun(token: string, runId: number): Promise<RunInfo> {
  const res = await fetch(`${API}/repos/${OWNER}/${ENGINE_REPO}/actions/runs/${runId}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) throw new Error(`run fetch failed ${res.status}`);
  const r = (await res.json()) as RunInfo;
  return { id: r.id, status: r.status, conclusion: r.conclusion, created_at: r.created_at, html_url: r.html_url };
}

export interface LogLine { ts: string; text: string }

/** Хвост лога последнего джоба (без скачивания всего лога). */
export async function tailJobLog(token: string, runId: number, maxLines = 60): Promise<LogLine[]> {
  const jobs = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/runs/${runId}/jobs`,
    { headers: ghHeaders(token) },
  );
  if (!jobs.ok) return [];
  const data = (await jobs.json()) as {
    jobs: Array<{ id: number; started_at: string }>;
  };
  const job = data.jobs[0];
  if (!job) return [];
  const log = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/jobs/${job.id}/logs`,
    { headers: ghHeaders(token) },
  );
  if (!log.ok) return [];
  const text = await log.text();
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-maxLines).map((l) => {
    // формат: "2026-09-15T07:00:00.0000000Z <line>"
    const m = l.match(/^(\S+Z)\s(.*)$/s);
    return m ? { ts: m[1], text: m[2] } : { ts: '', text: l };
  });
}

export interface ArtifactInfo { id: number; name: string; size: number; expired: boolean }

export async function listArtifacts(token: string, runId: number): Promise<ArtifactInfo[]> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders(token) },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    artifacts: Array<{ id: number; name: string; size_in_bytes: number; expired: boolean }>;
  };
  return data.artifacts.map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes, expired: a.expired }));
}

/** Скачивание артефакта (zip). Токен обязателен даже для публичного репо. */
export async function downloadArtifactUrl(token: string, artifactId: number): Promise<string> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${ENGINE_REPO}/actions/artifacts/${artifactId}/zip`,
    { headers: ghHeaders(token), redirect: 'follow' },
  );
  if (!res.ok) throw new Error(`artifact download failed ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
