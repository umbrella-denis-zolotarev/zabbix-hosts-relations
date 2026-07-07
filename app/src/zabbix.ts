// Zabbix JSON-RPC client.
//
// The browser POSTs JSON-RPC to the python proxy at `/api/zabbix` (nginx
// forwards `/api/` to the python container). The proxy injects the auth token
// server-side and relays the request to the real Zabbix API, so the token is
// never shipped to the browser and there is no cross-origin call to Zabbix.
// Configure ZABBIX_URL and ZABBIX_TOKEN for the python container in
// .docker/.env.

const DATA_URL = import.meta.env.DATA_URL ?? "http://localhost";
const API_URL = `${DATA_URL}/api/zabbix`;

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string; // "0" = monitored (enabled), "1" = not monitored (disabled)
  groups?: ZabbixGroup[];
}

export interface ZabbixInterface {
  interfaceid: string;
  ip: string;
  dns: string;
  port: string;
  type: string; // 1=agent, 2=SNMP, 3=IPMI, 4=JMX
  main: string; // "1" = default interface
  useip: string; // "1" = connect via IP, "0" = via DNS
}

export interface ZabbixGroup {
  groupid: string;
  name: string;
}

export interface ZabbixHostDetail extends ZabbixHost {
  description: string;
  available?: string;
  interfaces?: ZabbixInterface[];
  groups?: ZabbixGroup[];
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: string };
}

let requestId = 0;

async function call<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: ++requestId,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json: JsonRpcResponse<T> = await res.json();
  if (json.error) {
    throw new Error(`${json.error.message}: ${json.error.data ?? ""}`.trim());
  }
  return json.result as T;
}

// Fetch hosts. With a `search` term, the query is filtered server-side by
// technical name (host) or visible name (case-insensitive substring, either
// field matches). Without one, all hosts (within the configured groups) are
// returned — used to populate the related-host picker and the relations map.
export function getHosts(search?: string): Promise<ZabbixHost[]> {
  const params: Record<string, unknown> = {
    output: ["hostid", "host", "name", "status"],
    selectGroups: ["groupid", "name"],
    sortfield: "name",
  };
  const q = search?.trim();
  if (q) {
    params.search = { host: q, name: q };
    params.searchByAny = true; // match either field, not both
  }
  return call<ZabbixHost[]>("host.get", params);
}

export async function getHost(
  hostid: string,
): Promise<ZabbixHostDetail | null> {
  const result = await call<ZabbixHostDetail[]>("host.get", {
    hostids: hostid,
    output: ["hostid", "host", "name", "status", "description", "available"],
    selectInterfaces: ["interfaceid", "ip", "dns", "port", "type", "main", "useip"],
    selectGroups: ["groupid", "name"],
  });
  return result[0] ?? null;
}
