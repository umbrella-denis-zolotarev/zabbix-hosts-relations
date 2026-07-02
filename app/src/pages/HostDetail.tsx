import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CodeOutlined,
  FileTextOutlined,
  LineChartOutlined,
  MinusCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  getHost,
  getHosts,
  type ZabbixHost,
  type ZabbixHostDetail,
  type ZabbixInterface,
} from "../zabbix";
import {
  getRelations,
  relationsForHost,
  saveRelations,
  setHostRelations,
  validateHostRelations,
  type HostPair,
  type HostRelation,
} from "../relations";
import {
  getAnsibleStatus,
  runAnsible,
  type AnsibleState,
  type AnsibleStatus,
} from "../ansible";

const INTERFACE_TYPE: Record<string, string> = {
  "1": "Agent",
  "2": "SNMP",
  "3": "IPMI",
  "4": "JMX",
};

const interfaceColumns: ColumnsType<ZabbixInterface> = [
  {
    title: "Type",
    dataIndex: "type",
    key: "type",
    render: (type: string) => INTERFACE_TYPE[type] ?? type,
  },
  {
    title: "IP",
    dataIndex: "ip",
    key: "ip",
    render: (ip: string) => ip || "—",
  },
  {
    title: "DNS",
    dataIndex: "dns",
    key: "dns",
    render: (dns: string) => dns || "—",
  },
  { title: "Port", dataIndex: "port", key: "port" },
  {
    title: "Connect via",
    dataIndex: "useip",
    key: "useip",
    render: (useip: string) => (useip === "1" ? "IP" : "DNS"),
  },
  {
    title: "Default",
    dataIndex: "main",
    key: "main",
    render: (main: string) => (main === "1" ? <Tag color="blue">default</Tag> : ""),
  },
];

// Pick the IP to SSH into: prefer the default (main) interface, then any
// interface configured to connect via IP, then the first one with an IP set.
function resolveHostIp(host: ZabbixHostDetail | null): string | null {
  const interfaces = host?.interfaces ?? [];
  const candidate =
    interfaces.find((i) => i.main === "1" && i.ip) ??
    interfaces.find((i) => i.useip === "1" && i.ip) ??
    interfaces.find((i) => i.ip);
  return candidate?.ip ?? null;
}

const ANSIBLE_STATUS_META: Record<AnsibleState, { label: string; color: string }> = {
  none: { label: "never run", color: "#b0b0b0" },
  running: { label: "running…", color: "#1677ff" },
  ok: { label: "ok", color: "#52c41a" },
  failed: { label: "failed", color: "#ff4d4f" },
};

// One-line "<status> · <when>" summary shown inside the Ansible button.
function ansibleSummary(s: AnsibleStatus): string {
  const meta = ANSIBLE_STATUS_META[s.status] ?? ANSIBLE_STATUS_META.none;
  if (s.status === "none") return meta.label;
  const ts = s.finished_at || s.started_at;
  const when = ts ? new Date(ts).toLocaleString() : "";
  return when ? `${meta.label} · ${when}` : meta.label;
}

function HostDetail() {
  const { hostid } = useParams<{ hostid: string }>();
  const navigate = useNavigate();
  const [host, setHost] = useState<ZabbixHostDetail | null>(null);
  const [allHosts, setAllHosts] = useState<ZabbixHost[]>([]);
  const [relations, setRelations] = useState<HostPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relations modal state. Each row is one editable link from this host's side:
  // this host's port, the related host, and the related host's port.
  const [modalOpen, setModalOpen] = useState(false);
  const [rows, setRows] = useState<HostRelation[]>([]);
  const [saving, setSaving] = useState(false);

  // Ansible run state.
  const [ansible, setAnsible] = useState<AnsibleStatus>({ status: "none" });
  const [ansibleStarting, setAnsibleStarting] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);

  const load = async () => {
    if (!hostid) return;
    setLoading(true);
    setError(null);
    try {
      const [data, hosts, rels] = await Promise.all([
        getHost(hostid),
        getHosts(),
        getRelations(),
      ]);
      setHost(data);
      setAllHosts(hosts);
      setRelations(rels);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostid]);

  // Load the last ansible run status when the host changes.
  useEffect(() => {
    if (!hostid) return;
    getAnsibleStatus(hostid).then(setAnsible).catch(() => {});
  }, [hostid]);

  // While a run is in progress, poll the status endpoint until it finishes.
  useEffect(() => {
    if (!hostid || ansible.status !== "running") return;
    const id = window.setInterval(() => {
      getAnsibleStatus(hostid).then(setAnsible).catch(() => {});
    }, 2000);
    return () => window.clearInterval(id);
  }, [hostid, ansible.status]);

  const runPlaybook = async () => {
    if (!hostid) return;
    setAnsibleStarting(true);
    setError(null);
    try {
      // The ansible inventory target — the host's technical name (e.g. "r0").
      const target = host?.host || hostid;
      const status = await runAnsible(hostid, target, host?.name || "");
      setAnsible(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnsibleStarting(false);
    }
  };

  // Relations of the current host (as numeric hostids).
  const currentRelations = hostid ? relationsForHost(relations, hostid) : [];

  const hostName = (id: number | string) => {
    const h = allHosts.find((x) => x.hostid === String(id));
    return h ? h.name || h.host : `#${id}`;
  };

  const openModal = () => {
    setError(null);
    setRows(currentRelations.map((r) => ({ ...r })));
    setModalOpen(true);
  };

  const updateRow = (index: number, patch: Partial<HostRelation>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, { port: "", hostid: 0, relatedPort: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!hostid) return;
    const links: HostRelation[] = rows.map((r) => ({
      hostid: Number(r.hostid) || 0,
      port: String(r.port).trim(),
      relatedPort: String(r.relatedPort).trim(),
    }));

    const validationError = validateHostRelations(relations, hostid, links);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const next = setHostRelations(relations, hostid, links);
      await saveRelations(next);
      setRelations(next);
      setModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Other hosts available to relate to (everything except this one).
  const otherHostOptions = allHosts
    .filter((h) => h.hostid !== hostid)
    .map((h) => ({
      label: `${h.name || h.host} (#${h.hostid})`,
      value: Number(h.hostid),
    }));

  const sshIp = resolveHostIp(host);
  const sshLogin = import.meta.env.SSH_LOGIN ?? '';

  // macOS Terminal.app is the default handler for the ssh:// URL scheme, so
  // navigating to ssh://<login>@<ip> opens Terminal and runs `ssh <login>@<ip>`.
  const openSsh = () => {
    if (!sshIp) return;
    window.location.href = `ssh://${sshLogin}@${sshIp}`;
  };

  const zabbixUrl = import.meta.env.ZABBIX_URL ?? "http://localhost";
  const openCharts = () => {
    if (!hostid) return;
    const url = `${zabbixUrl}/zabbix/zabbix.php?action=charts.view&filter_hostids%5B0%5D=${hostid}&filter_show=1&filter_set=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Flex vertical gap="middle" style={{ padding: 24 }}>
      <Flex align="center" justify="space-between" gap="middle">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>
            Back
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Host {host?.name ? `· ${host.name}` : `#${hostid}`}
          </Typography.Title>
        </Space>
        <Space>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={runPlaybook}
            loading={ansibleStarting || ansible.status === "running"}
            disabled={!host || ansible.status === "running"}
            title={
              ansible.status === "running"
                ? "Ansible playbook is running"
                : "Run the ansible playbook for this host"
            }
            style={{ height: "auto", paddingTop: 4, paddingBottom: 4 }}
          >
            <Flex vertical align="flex-start" style={{ lineHeight: 1.2 }}>
              <span>Ansible</span>
              <span
                style={{
                  fontSize: 12,
                  color: ANSIBLE_STATUS_META[ansible.status]?.color,
                }}
              >
                {ansibleSummary(ansible)}
              </span>
            </Flex>
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => setResultOpen(true)}
            disabled={!ansible.output}
            title="View the last ansible run output"
          >
            Ansible run result
          </Button>
          <Button
            icon={<ApartmentOutlined />}
            onClick={openModal}
            disabled={!host}
          >
            Relations
          </Button>
          <Button
            icon={<CodeOutlined />}
            onClick={openSsh}
            disabled={!sshIp}
            title={
              sshIp
                ? `ssh ${sshLogin}@${sshIp}`
                : "No interface IP available for this host"
            }
          >
            SSH
          </Button>
          <Button
            icon={<LineChartOutlined />}
            onClick={openCharts}
            disabled={!hostid}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load host"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Card>
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : !host ? (
          <Empty description={`Host #${hostid} not found`} />
        ) : (
          <Descriptions
            bordered
            column={{ xs: 1, sm: 1, md: 2 }}
            size="middle"
          >
            <Descriptions.Item label="Host ID">
              {host.hostid}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              {host.status === "0" ? (
                <Tag color="green">Enabled</Tag>
              ) : (
                <Tag color="red">Disabled</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Technical name">
              {host.host}
            </Descriptions.Item>
            <Descriptions.Item label="Visible name">
              {host.name}
            </Descriptions.Item>
            <Descriptions.Item label="Host groups" span={2}>
              {host.groups?.length ? (
                <Space size={[0, 8]} wrap>
                  {host.groups.map((g) => (
                    <Tag key={g.groupid}>{g.name}</Tag>
                  ))}
                </Space>
              ) : (
                "—"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>
              {host.description || "—"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {host && (
        <Card title="Interfaces" size="small">
          <Table<ZabbixInterface>
            rowKey="interfaceid"
            size="small"
            columns={interfaceColumns}
            dataSource={host.interfaces ?? []}
            pagination={false}
          />
        </Card>
      )}

      {host && (
        <Card
          title="Relations"
          size="small"
          extra={
            <Button
              type="link"
              icon={<ApartmentOutlined />}
              onClick={openModal}
            >
              Edit
            </Button>
          }
        >
          {currentRelations.length ? (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              {currentRelations.map((r, i) => (
                <Space key={i} size="small" wrap>
                  <Tag>port {r.port}</Tag>
                  <span>→</span>
                  <Tag
                    color="blue"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/hosts/${r.hostid}`)}
                  >
                    {hostName(r.hostid)} (#{r.hostid})
                  </Tag>
                  <Tag>port {r.relatedPort}</Tag>
                </Space>
              ))}
            </Space>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No relations"
            />
          )}
        </Card>
      )}

      <Modal
        title={`Relations · ${host?.name || `#${hostid}`}`}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Save"
        width={640}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Link a port on this host to a port on another host. Each port can be
          used by only one relation.
        </Typography.Paragraph>

        {rows.length ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Flex gap="small" style={{ fontSize: 12, opacity: 0.65 }}>
              <span style={{ width: 90 }}>Port</span>
              <span style={{ flex: 1 }}>Related host</span>
              <span style={{ width: 110 }}>Related port</span>
              <span style={{ width: 24 }} />
            </Flex>
            {rows.map((row, i) => (
              <Flex key={i} gap="small" align="center">
                <Input
                  style={{ width: 90 }}
                  placeholder="80"
                  value={row.port}
                  onChange={(e) => updateRow(i, { port: e.target.value })}
                />
                <Select
                  style={{ flex: 1 }}
                  showSearch
                  placeholder="Select host…"
                  value={row.hostid || undefined}
                  onChange={(v) => updateRow(i, { hostid: v })}
                  options={otherHostOptions}
                  optionFilterProp="label"
                />
                <Input
                  style={{ width: 110 }}
                  placeholder="81"
                  value={row.relatedPort}
                  onChange={(e) => updateRow(i, { relatedPort: e.target.value })}
                />
                <MinusCircleOutlined
                  style={{ width: 24, cursor: "pointer", opacity: 0.7 }}
                  onClick={() => removeRow(i)}
                />
              </Flex>
            ))}
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No relations"
          />
        )}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addRow}
          block
          style={{ marginTop: 12 }}
        >
          Add relation
        </Button>
      </Modal>

      <Modal
        title={
          <Space>
            <span>Ansible run result · {host?.name || `#${hostid}`}</span>
            <Tag color={ANSIBLE_STATUS_META[ansible.status]?.color}>
              {ANSIBLE_STATUS_META[ansible.status]?.label}
            </Tag>
          </Space>
        }
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        footer={null}
        width={900}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {ansibleSummary(ansible)}
        </Typography.Paragraph>
        <pre
          style={{
            margin: 0,
            maxHeight: "60vh",
            overflow: "auto",
            padding: 12,
            background: "rgba(0,0,0,0.35)",
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {ansible.output || "No output yet."}
        </pre>
      </Modal>
    </Flex>
  );
}

export default HostDetail;
