// Client for the python ansible runner (proxied by nginx at /api).
//
// runAnsible() kicks off the playbook in the background on the server and
// returns immediately with status "running"; getAnsibleStatus() is polled by
// the host detail page until the run finishes (status becomes "ok"/"failed").

const DATA_URL = import.meta.env.DATA_URL ?? "http://localhost";
const RUN_URL = `${DATA_URL}/api/ansible/run`;
const STATUS_URL = `${DATA_URL}/api/ansible/status`;

export type AnsibleState = "none" | "running" | "ok" | "failed";

export interface AnsibleStatus {
  status: AnsibleState;
  target?: string;
  output?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export async function runAnsible(
  hostid: string,
  target: string,
  visibleName: string,
): Promise<AnsibleStatus> {
  const res = await fetch(RUN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostid, target, visible_name: visibleName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getAnsibleStatus(
  hostid: string,
): Promise<AnsibleStatus> {
  const res = await fetch(`${STATUS_URL}?hostid=${encodeURIComponent(hostid)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}
