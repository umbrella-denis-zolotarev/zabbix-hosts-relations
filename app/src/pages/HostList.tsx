import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Flex,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getHosts, type ZabbixHost } from "../zabbix";
import HostDetailModal from "../components/HostDetailModal";

const columns: ColumnsType<ZabbixHost> = [
  {
    title: "Host ID",
    dataIndex: "hostid",
    key: "hostid",
    width: 120,
    sorter: (a, b) => Number(a.hostid) - Number(b.hostid),
  },
  {
    title: "Technical name",
    dataIndex: "host",
    key: "host",
    sorter: (a, b) => a.host.localeCompare(b.host),
  },
  {
    title: "Visible name",
    dataIndex: "name",
    key: "name",
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  {
    title: "Groups",
    dataIndex: "groups",
    key: "groups",
    render: (groups: ZabbixHost["groups"]) => (
      <Space size={[0, 4]} wrap>
        {(groups ?? []).map((g) => (
          <Tag key={g.groupid}>{g.name}</Tag>
        ))}
      </Space>
    ),
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    width: 140,
    filters: [
      { text: "Enabled", value: "0" },
      { text: "Disabled", value: "1" },
    ],
    onFilter: (value, record) => record.status === value,
    render: (status: string) =>
      status === "0" ? (
        <Tag color="green">Enabled</Tag>
      ) : (
        <Tag color="red">Disabled</Tag>
      ),
  },
];

function HostList() {
  const navigate = useNavigate();
  // The selected host id comes from the route (/hosts/:hostid), which drives
  // the detail modal — so deep links and the back button keep working.
  const { hostid: selectedHostId } = useParams<{ hostid: string }>();
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHosts();
      setHosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openHost = (id: string) => navigate(`/hosts/${id}`);

  // Local, client-side search across all visible fields (incl. group names).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter((h) =>
      [h.hostid, h.host, h.name, ...(h.groups ?? []).map((g) => g.name)].some(
        (v) => v.toLowerCase().includes(q),
      ),
    );
  }, [hosts, search]);

  return (
    <Flex vertical gap="middle" style={{ padding: 24 }}>
      <Flex align="center" justify="space-between" gap="middle">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Zabbix Hosts
        </Typography.Title>
        <Space>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search hosts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <Button
            icon={<ApartmentOutlined />}
            onClick={() => navigate("/map")}
          >
            Relations map
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load hosts"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Table<ZabbixHost>
        rowKey="hostid"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        size="middle"
        pagination={{ showSizeChanger: true, defaultPageSize: 20 }}
        footer={() => `${filtered.length} of ${hosts.length} host(s)`}
        onRow={(record) => ({
          onClick: () => openHost(record.hostid),
          style: { cursor: "pointer" },
        })}
      />

      <HostDetailModal
        hostid={selectedHostId ?? null}
        onClose={() => navigate("/")}
        onOpenHost={openHost}
      />
    </Flex>
  );
}

export default HostList;
