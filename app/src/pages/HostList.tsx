import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Input,
  Space,
  Table,
  Tag,
} from "antd";
import {
  ApartmentOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getHosts, type ZabbixHost } from "../zabbix";
import HostDetailModal from "../components/HostDetailModal";

// Return `value` but only after it has stopped changing for `delay` ms — used
// to debounce the search box so we don't fire a request on every keystroke.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

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
  const [reloadTick, setReloadTick] = useState(0);

  const query = search.trim();
  const debouncedQuery = useDebouncedValue(query, 300);

  const openHost = (id: string) => navigate(`/hosts/${id}`);

  // Load results whenever the debounced query changes (or a manual refresh is
  // requested). An empty query loads nothing — the list stays hidden.
  useEffect(() => {
    if (!debouncedQuery) {
      setHosts([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHosts(debouncedQuery)
      .then((data) => {
        if (!cancelled) setHosts(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, reloadTick]);

  // Show the spinner during the debounce gap too, so results feel live.
  const searching = query !== "" && (loading || query !== debouncedQuery);

  return (
    <Flex vertical gap="large" style={{ padding: 24 }}>
      <Flex vertical align="center" gap="middle" style={{ marginTop: 24 }}>
        <Input
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search hosts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 640, height: 56, fontSize: 20 }}
        />
        <Space>
          <Button
            icon={<ApartmentOutlined />}
            onClick={() => navigate("/map")}
          >
            Relations map
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReloadTick((n) => n + 1)}
            loading={searching}
            disabled={!query}
          >
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

      {query ? (
        <Table<ZabbixHost>
          rowKey="hostid"
          columns={columns}
          dataSource={hosts}
          loading={searching}
          size="middle"
          pagination={{ showSizeChanger: true, defaultPageSize: 20 }}
          footer={() => `${hosts.length} host(s)`}
          onRow={(record) => ({
            onClick: () => openHost(record.hostid),
            style: { cursor: "pointer" },
          })}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Type in the search box to find hosts"
          style={{ padding: "48px 0" }}
        />
      )}

      <HostDetailModal
        hostid={selectedHostId ?? null}
        onClose={() => navigate("/")}
        onOpenHost={openHost}
      />
    </Flex>
  );
}

export default HostList;
