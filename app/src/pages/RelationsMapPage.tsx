import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Flex,
  Skeleton,
  Space,
  Typography,
} from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { getHosts, type ZabbixHost } from "../zabbix";
import { getRelations, type HostPair } from "../relations";
import RelationsMap from "../components/RelationsMap";
import HostDetailModal from "../components/HostDetailModal";

function RelationsMapPage() {
  const navigate = useNavigate();
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [relations, setRelations] = useState<HostPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clicking a node opens the detail modal in place, so the map stays put.
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, rels] = await Promise.all([getHosts(), getRelations()]);
      setHosts(data);
      setRelations(rels);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Flex vertical gap="middle" style={{ padding: 24 }}>
      <Flex align="center" justify="space-between" gap="middle">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>
            Back
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Relations map
          </Typography.Title>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      </Flex>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load relations"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Card size="small">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <RelationsMap
            pairs={relations}
            hosts={hosts}
            onSelect={setSelected}
          />
        )}
      </Card>

      <HostDetailModal
        hostid={selected}
        onClose={() => setSelected(null)}
        onOpenHost={setSelected}
      />
    </Flex>
  );
}

export default RelationsMapPage;
