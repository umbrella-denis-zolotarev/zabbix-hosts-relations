import { useMemo, useState } from "react";
import { Empty, theme } from "antd";
import type { HostPair } from "../relations";
import type { ZabbixHost } from "../zabbix";

interface Props {
  // Undirected host links. Only the hosts that appear here are drawn.
  pairs: HostPair[];
  // Used to label the nodes with the host's visible/technical name.
  hosts: ZabbixHost[];
  // Open a host (click a node).
  onSelect: (hostid: string) => void;
}

// Grid geometry.
const GAP_X = 260;
const GAP_Y = 150;
const MARGIN_X = 120;
const MARGIN_Y = 70;

// A schematic map of the hosts that have relations. Nodes are laid out on a
// grid and every link is routed with right angles only (horizontal/vertical
// segments). Each link's two port numbers are shown next to its ends. Clicking
// a node opens it; hovering a node highlights just its links.
function RelationsMap({ pairs, hosts, onSelect }: Props) {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const map = new Map(hosts.map((h) => [h.hostid, h.name || h.host]));
    return (id: string) => map.get(id) || `#${id}`;
  }, [hosts]);

  const { nodes, edges, width, height } = useMemo(() => {
    // Unique hosts that take part in at least one relation, sorted for a
    // stable layout.
    const ids = Array.from(
      new Set(pairs.flatMap((p) => [p.hostA, p.hostB])),
    ).sort((a, b) => Number(a) - Number(b));

    const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
    const rows = Math.max(1, Math.ceil(ids.length / cols));

    const degree = new Map<string, number>();
    for (const p of pairs) {
      degree.set(p.hostA, (degree.get(p.hostA) ?? 0) + 1);
      degree.set(p.hostB, (degree.get(p.hostB) ?? 0) + 1);
    }

    const pos = new Map<string, { x: number; y: number }>();
    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos.set(id, {
        x: MARGIN_X + col * GAP_X,
        y: MARGIN_Y + row * GAP_Y,
      });
    });

    const nodes = ids.map((id) => ({
      id,
      ...pos.get(id)!,
      // Scale the node with its number of links, capped so hubs stay sane.
      r: 8 + Math.min(degree.get(id) ?? 0, 8),
    }));

    const edges = pairs.map((p, i) => ({
      key: i,
      a: p.hostA,
      b: p.hostB,
      portA: p.hostAport,
      portB: p.hostBport,
      from: pos.get(p.hostA)!,
      to: pos.get(p.hostB)!,
      // Stagger the vertical channel so links between the same rows don't sit
      // exactly on top of one another.
      offset: ((i % 5) - 2) * 16,
    }));

    return {
      nodes,
      edges,
      width: MARGIN_X * 2 + (cols - 1) * GAP_X,
      height: MARGIN_Y * 2 + (rows - 1) * GAP_Y + 24,
    };
  }, [pairs]);

  if (!nodes.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No hosts with relations yet"
      />
    );
  }

  // A halo behind small text so it stays readable where it crosses a line.
  const labelHalo = {
    paintOrder: "stroke" as const,
    stroke: token.colorBgContainer,
    strokeWidth: 3,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxHeight: "78vh", display: "block", userSelect: "none" }}
    >
      {edges.map((e) => {
        const active = !hovered || e.a === hovered || e.b === hovered;
        const { x: x1, y: y1 } = e.from;
        const { x: x2, y: y2 } = e.to;
        // Route with a vertical channel at the (staggered) midpoint x, so the
        // polyline only ever turns at 90°.
        const xmid = (x1 + x2) / 2 + e.offset;
        const points = `${x1},${y1} ${xmid},${y1} ${xmid},${y2} ${x2},${y2}`;

        // Port labels sit just off each node, along the segment leaving it.
        const dxA = xmid - x1;
        const portAPos =
          Math.abs(dxA) > 1
            ? { x: x1 + Math.sign(dxA) * 22, y: y1 - 9 }
            : { x: x1 + 12, y: y1 + Math.sign(y2 - y1 || 1) * 22 };
        const dxB = x2 - xmid;
        const portBPos =
          Math.abs(dxB) > 1
            ? { x: x2 - Math.sign(dxB) * 22, y: y2 - 9 }
            : { x: x2 + 12, y: y2 - Math.sign(y2 - y1 || 1) * 22 };

        return (
          <g key={e.key} opacity={active ? 1 : 0.12}>
            <polyline
              points={points}
              fill="none"
              stroke={active ? token.colorPrimary : token.colorBorderSecondary}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={active ? 0.7 : 0.4}
            />
            <text
              x={portAPos.x}
              y={portAPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill={token.colorTextSecondary}
              style={labelHalo}
            >
              {e.portA}
            </text>
            <text
              x={portBPos.x}
              y={portBPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill={token.colorTextSecondary}
              style={labelHalo}
            >
              {e.portB}
            </text>
          </g>
        );
      })}

      {nodes.map((n) => {
        const active =
          !hovered ||
          n.id === hovered ||
          edges.some(
            (e) =>
              (e.a === hovered && e.b === n.id) ||
              (e.b === hovered && e.a === n.id),
          );
        return (
          <g
            key={n.id}
            style={{ cursor: "pointer" }}
            opacity={active ? 1 : 0.3}
            onClick={() => onSelect(n.id)}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{`${nameOf(n.id)} (#${n.id})`}</title>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.id === hovered ? token.colorPrimary : token.colorPrimaryBg}
              stroke={token.colorPrimary}
              strokeWidth={2}
            />
            <text
              x={n.x}
              y={n.y + n.r + 15}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fill={token.colorText}
              style={labelHalo}
            >
              {nameOf(n.id)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default RelationsMap;
