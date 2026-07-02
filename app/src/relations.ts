// Client for the python relations server.
//
// Mirrors:
//   curl http://localhost:3014/data
//   curl -X POST http://localhost:3014/data -d '[{"hostA":"10823","hostB":"10747"}]'
//
// The browser calls the python data server through nginx, which proxies the
// `/api/` location to the python container (see .docker/nginx/conf.d/app.conf).
// The whole file (data.json) is a list of undirected host pairs — each relation
// is stored once as { hostA, hostB }.

const DATA_URL = import.meta.env.DATA_URL ?? "http://localhost";
const RELATIONS_URL = `${DATA_URL}/api/data`;

export interface HostPair {
  hostA: string;
  hostB: string;
}

// Canonicalize a list of pairs: drop empty/self pairs, store each undirected
// edge once with the smaller hostid as hostA, and sort deterministically.
function normalizePairs(pairs: HostPair[]): HostPair[] {
  const seen = new Map<string, HostPair>();
  for (const p of pairs ?? []) {
    const a = String(p?.hostA ?? "");
    const b = String(p?.hostB ?? "");
    if (!a || !b || a === b) continue;
    const [hostA, hostB] = Number(a) <= Number(b) ? [a, b] : [b, a];
    seen.set(`${hostA}|${hostB}`, { hostA, hostB });
  }
  return [...seen.values()].sort(
    (x, y) =>
      Number(x.hostA) - Number(y.hostA) || Number(x.hostB) - Number(y.hostB),
  );
}

export async function getRelations(): Promise<HostPair[]> {
  const res = await fetch(RELATIONS_URL);
  // The server returns 404 until something has been saved.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return normalizePairs(Array.isArray(data) ? (data as HostPair[]) : []);
}

export async function saveRelations(pairs: HostPair[]): Promise<void> {
  const res = await fetch(RELATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizePairs(pairs)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
}

// The hostids related to a given host (relations are two-sided by nature: a
// pair { hostA, hostB } links both directions).
export function relationsForHost(pairs: HostPair[], hostid: string): number[] {
  const host = String(hostid);
  const out = new Set<number>();
  for (const p of pairs) {
    if (p.hostA === host) out.add(Number(p.hostB));
    else if (p.hostB === host) out.add(Number(p.hostA));
  }
  return [...out].sort((a, b) => a - b);
}

// Set the relations for a single host authoritatively: drop every pair that
// involves this host, then add a pair for each currently selected host.
export function setHostRelations(
  pairs: HostPair[],
  hostid: string,
  relations: number[],
): HostPair[] {
  const host = String(hostid);
  const target = new Set(relations.map(String));
  target.delete(host); // a host can't relate to itself

  const kept = pairs.filter((p) => p.hostA !== host && p.hostB !== host);
  const added: HostPair[] = [...target].map((n) => ({ hostA: host, hostB: n }));
  return normalizePairs([...kept, ...added]);
}
