// Zabbix JSON-RPC client.
//
// Mirrors:
//   curl -s -X POST -H "Content-Type: application/json-rpc" \
//     -H "Authorization: Bearer <token>" \
//     http://192.168.4.56/zabbix/api_jsonrpc.php \
//     -d '{"jsonrpc":"2.0","method":"host.get","params":{"output":["hostid","host","name","status"]},"id":1}'
//
// The browser calls the Zabbix server directly. Configure the base URL and
// token via ZABBIX_URL and VITE_ZABBIX_TOKEN in .docker/.env. (The Zabbix
// server must allow CORS from this app's origin.)

const ZABBIX_URL = import.meta.env.ZABBIX_URL ?? "http://localhost";
const API_URL = `${ZABBIX_URL}/zabbix/api_jsonrpc.php`;
const API_TOKEN = import.meta.env.VITE_ZABBIX_TOKEN ?? "";

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string; // "0" = monitored (enabled), "1" = not monitored (disabled)
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
      "Content-Type": "application/json-rpc",
      Authorization: `Bearer ${API_TOKEN}`,
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

export function getHosts(): Promise<ZabbixHost[]> {
  return call<ZabbixHost[]>("host.get", {
    output: ["hostid", "host", "name", "status"],
  });
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
