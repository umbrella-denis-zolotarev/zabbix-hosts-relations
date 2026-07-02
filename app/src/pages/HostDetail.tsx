import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
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
  LineChartOutlined,
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
  type HostPair,
} from "../relations";

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

function HostDetail() {
  const { hostid } = useParams<{ hostid: string }>();
  const navigate = useNavigate();
  const [host, setHost] = useState<ZabbixHostDetail | null>(null);
  const [allHosts, setAllHosts] = useState<ZabbixHost[]>([]);
  const [relations, setRelations] = useState<HostPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relations modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

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

  // Relations of the current host (as numeric hostids).
  const currentRelations = hostid ? relationsForHost(relations, hostid) : [];

  const hostName = (id: number | string) => {
    const h = allHosts.find((x) => x.hostid === String(id));
    return h ? h.name || h.host : `#${id}`;
  };

  const openModal = () => {
    setSelected(currentRelations);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!hostid) return;
    setSaving(true);
    setError(null);
    try {
      const next = setHostRelations(relations, hostid, selected);
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
              {currentRelations.map((id) => (
                <Tag
                  key={id}
                  color="blue"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/hosts/${id}`)}
                >
                  {hostName(id)} (#{id})
                </Tag>
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
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Select the hosts related to this one.
        </Typography.Paragraph>
        <Select
          mode="multiple"
          allowClear
          style={{ width: "100%" }}
          placeholder="Select related hosts…"
          value={selected}
          onChange={setSelected}
          options={otherHostOptions}
          optionFilterProp="label"
        />
      </Modal>
    </Flex>
  );
}

export default HostDetail;
