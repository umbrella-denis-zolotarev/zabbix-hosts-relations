// Client for the python relations server.
//
// The browser calls the python data server through nginx, which proxies the
// `/api/` location to the python container (see .docker/nginx/conf.d/app.conf).
// data.json is a list of undirected host links. Each link connects a port on
// one host to a port on another:
//   { hostA, hostAport, hostB, hostBport }
// A port may take part in several links; only exact-duplicate links are merged.

const DATA_URL = import.meta.env.DATA_URL ?? "http://localhost";
const RELATIONS_URL = `${DATA_URL}/api/data`;

export interface HostPair {
  hostA: string;
  hostAport: string;
  hostB: string;
  hostBport: string;
}

// A link seen from one host's perspective.
export interface HostRelation {
  hostid: number; // the related host
  port: string; // this host's port
  relatedPort: string; // the related host's port
}

// Order a link's endpoints deterministically (smaller hostid first, ties broken
// by port), keeping each endpoint's port attached to its host.
function orderPair(p: HostPair): HostPair {
  const aFirst =
    Number(p.hostA) < Number(p.hostB) ||
    (p.hostA === p.hostB && Number(p.hostAport) <= Number(p.hostBport));
  return aFirst
    ? p
    : { hostA: p.hostB, hostAport: p.hostBport, hostB: p.hostA, hostBport: p.hostAport };
}

// Canonicalize: drop incomplete/self links, order endpoints, drop exact
// duplicates, and sort deterministically.
function normalizePairs(pairs: HostPair[]): HostPair[] {
  const seen = new Map<string, HostPair>();
  for (const raw of pairs ?? []) {
    const hostA = String(raw?.hostA ?? "");
    const hostAport = String(raw?.hostAport ?? "");
    const hostB = String(raw?.hostB ?? "");
    const hostBport = String(raw?.hostBport ?? "");
    if (!hostA || !hostB || !hostAport || !hostBport || hostA === hostB) continue;
    const p = orderPair({ hostA, hostAport, hostB, hostBport });
    const key = `${p.hostA}:${p.hostAport}|${p.hostB}:${p.hostBport}`;
    seen.set(key, p);
  }
  return [...seen.values()].sort(
    (x, y) =>
      Number(x.hostA) - Number(y.hostA) ||
      Number(x.hostAport) - Number(y.hostAport) ||
      Number(x.hostB) - Number(y.hostB) ||
      Number(x.hostBport) - Number(y.hostBport),
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

// The links of a given host (relations are two-sided: a link connects both
// directions), from that host's point of view.
export function relationsForHost(
  pairs: HostPair[],
  hostid: string,
): HostRelation[] {
  const host = String(hostid);
  const out: HostRelation[] = [];
  for (const p of pairs) {
    if (p.hostA === host) {
      out.push({ hostid: Number(p.hostB), port: p.hostAport, relatedPort: p.hostBport });
    } else if (p.hostB === host) {
      out.push({ hostid: Number(p.hostA), port: p.hostBport, relatedPort: p.hostAport });
    }
  }
  return out.sort(
    (x, y) => Number(x.port) - Number(y.port) || x.hostid - y.hostid,
  );
}

// Validate a proposed set of links for `hostid`. A port may be reused across
// several relations, so the only requirements are that each row is complete and
// that a host isn't related to itself. Returns an error string, or null.
export function validateHostRelations(
  _pairs: HostPair[],
  hostid: string,
  links: HostRelation[],
): string | null {
  const host = String(hostid);

  for (const l of links) {
    if (!l.hostid || l.port === "" || l.relatedPort === "") {
      return "Every relation needs a port, a related host, and a related host port.";
    }
    if (String(l.hostid) === host) return "A host can't be related to itself.";
  }
  return null;
}

// Set the links for a single host authoritatively: drop every link that
// involves this host, then add one per provided relation.
export function setHostRelations(
  pairs: HostPair[],
  hostid: string,
  links: HostRelation[],
): HostPair[] {
  const host = String(hostid);
  const kept = pairs.filter((p) => p.hostA !== host && p.hostB !== host);
  const added: HostPair[] = links
    .filter(
      (l) => l.hostid && l.port !== "" && l.relatedPort !== "" && String(l.hostid) !== host,
    )
    .map((l) => ({
      hostA: host,
      hostAport: String(l.port),
      hostB: String(l.hostid),
      hostBport: String(l.relatedPort),
    }));
  return normalizePairs([...kept, ...added]);
}
