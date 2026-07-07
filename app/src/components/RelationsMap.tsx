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

// Distinct, colour-blind-friendly hues used to tell crossing links apart.
// Non-crossing links keep the theme's primary colour (handled separately).
const CROSS_COLORS = [
  "#e8590c", // orange
  "#2f9e44", // green
  "#9c36b5", // grape
  "#e03131", // red
  "#0c8599", // teal
  "#f08c00", // amber
  "#5f3dc4", // indigo
  "#c2255c", // pink
];

const L = 130; // ideal edge length for the layout
const COMP_PAD = 46; // padding around each component (room for labels)
const COMP_GAP = 50; // gap between packed components
const MAX_ROW = 1250; // wrap components to a new row past this width

interface Pt {
  x: number;
  y: number;
}

// Signed area sign of triangle (a, b, c) — the turn direction.
function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

// Do open segments a-b and c-d properly cross (excluding shared endpoints)?
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return (
    orient(a, b, c) > 0 !== orient(a, b, d) > 0 &&
    orient(c, d, a) > 0 !== orient(c, d, b) > 0
  );
}

// A schematic map of the hosts that have relations. Each connected group of
// hosts is laid out on its own with a small force-directed pass, then the
// groups are packed into the canvas — this keeps disconnected clusters from
// collapsing into each other. Links are straight; any two that actually cross
// are drawn in different colours (greedy colouring of the crossing-conflict
// graph). Clicking a node opens it; hovering highlights its links.
function RelationsMap({ pairs, hosts, onSelect }: Props) {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const map = new Map(hosts.map((h) => [h.hostid, h.name || h.host]));
    return (id: string) => map.get(id) || `#${id}`;
  }, [hosts]);

  const { nodes, edges, width, height } = useMemo(() => {
    const ids = Array.from(
      new Set(pairs.flatMap((p) => [p.hostA, p.hostB])),
    ).sort((a, b) => Number(a) - Number(b));
    const idx = new Map(ids.map((id, i) => [id, i]));

    const degree = new Map<string, number>();
    const adj: number[][] = ids.map(() => []);
    for (const p of pairs) {
      degree.set(p.hostA, (degree.get(p.hostA) ?? 0) + 1);
      degree.set(p.hostB, (degree.get(p.hostB) ?? 0) + 1);
    }
    const links = pairs.map((p) => {
      const u = idx.get(p.hostA)!;
      const v = idx.get(p.hostB)!;
      adj[u].push(v);
      adj[v].push(u);
      return { u, v };
    });

    // Connected components (BFS).
    const comp = new Array(ids.length).fill(-1);
    let nc = 0;
    for (let s = 0; s < ids.length; s++) {
      if (comp[s] !== -1) continue;
      const q = [s];
      comp[s] = nc;
      while (q.length) {
        const x = q.pop()!;
        for (const y of adj[x])
          if (comp[y] === -1) {
            comp[y] = nc;
            q.push(y);
          }
      }
      nc++;
    }
    const members: number[][] = Array.from({ length: nc }, () => []);
    ids.forEach((_, i) => members[comp[i]].push(i));

    const pos: Pt[] = ids.map(() => ({ x: 0, y: 0 }));

    // Force-directed layout, run independently per component so separate
    // clusters don't repel each other off to infinity. Deterministic (circle
    // init, no randomness) so the picture is stable across re-renders.
    for (let c = 0; c < nc; c++) {
      const mem = members[c];
      const m = mem.length;
      mem.forEach((gi, i) => {
        const a = (2 * Math.PI * i) / m;
        pos[gi] = {
          x: Math.cos(a) * L * (0.6 + m * 0.05),
          y: Math.sin(a) * L * (0.6 + m * 0.05),
        };
      });
      if (m === 1) {
        pos[mem[0]] = { x: 0, y: 0 };
        continue;
      }
      const localLinks = links.filter((l) => comp[l.u] === c);
      let temp = L * 1.5;
      for (let it = 0; it < 350; it++) {
        const disp = new Map<number, Pt>(mem.map((gi) => [gi, { x: 0, y: 0 }]));
        for (let i = 0; i < m; i++) {
          for (let j = i + 1; j < m; j++) {
            const a = pos[mem[i]];
            const b = pos[mem[j]];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d = Math.hypot(dx, dy);
            if (d < 0.01) {
              dx = (i - j) * 0.1 + 0.1;
              dy = 0.1;
              d = Math.hypot(dx, dy);
            }
            const f = (L * L) / d;
            const ux = (dx / d) * f;
            const uy = (dy / d) * f;
            disp.get(mem[i])!.x += ux;
            disp.get(mem[i])!.y += uy;
            disp.get(mem[j])!.x -= ux;
            disp.get(mem[j])!.y -= uy;
          }
        }
        for (const { u, v } of localLinks) {
          const dx = pos[u].x - pos[v].x;
          const dy = pos[u].y - pos[v].y;
          const d = Math.hypot(dx, dy) || 0.01;
          const f = (d * d) / L;
          const ux = (dx / d) * f;
          const uy = (dy / d) * f;
          disp.get(u)!.x -= ux;
          disp.get(u)!.y -= uy;
          disp.get(v)!.x += ux;
          disp.get(v)!.y += uy;
        }
        for (const gi of mem) {
          const dd = disp.get(gi)!;
          const d = Math.hypot(dd.x, dd.y) || 0.01;
          pos[gi].x += (dd.x / d) * Math.min(d, temp);
          pos[gi].y += (dd.y / d) * Math.min(d, temp);
        }
        temp *= 0.97;
      }
    }

    // Pack the components into rows (largest first) so they tile the canvas.
    const boxes = members.map((mem) => {
      const xs = mem.map((gi) => pos[gi].x);
      const ys = mem.map((gi) => pos[gi].y);
      const minX = Math.min(...xs) - COMP_PAD;
      const minY = Math.min(...ys) - COMP_PAD;
      return {
        minX,
        minY,
        w: Math.max(...xs) + COMP_PAD - minX,
        h: Math.max(...ys) + COMP_PAD - minY,
        mem,
      };
    });
    const order = boxes
      .map((_, i) => i)
      .sort((a, b) => boxes[b].w * boxes[b].h - boxes[a].w * boxes[a].h);
    let cx = 0;
    let cy = 0;
    let rowH = 0;
    let totalW = 0;
    for (const bi of order) {
      const b = boxes[bi];
      if (cx > 0 && cx + b.w > MAX_ROW) {
        cy += rowH + COMP_GAP;
        cx = 0;
        rowH = 0;
      }
      const offX = cx - b.minX;
      const offY = cy - b.minY;
      for (const gi of b.mem) {
        pos[gi].x += offX;
        pos[gi].y += offY;
      }
      cx += b.w + COMP_GAP;
      rowH = Math.max(rowH, b.h);
      totalW = Math.max(totalW, cx - COMP_GAP);
    }

    const nodes = ids.map((id, i) => ({
      id,
      x: pos[i].x,
      y: pos[i].y,
      r: 8 + Math.min(degree.get(id) ?? 0, 8),
    }));

    const edges = pairs.map((p, i) => ({
      key: i,
      a: p.hostA,
      b: p.hostB,
      portA: p.hostAport,
      portB: p.hostBport,
      from: pos[links[i].u],
      to: pos[links[i].v],
      u: links[i].u,
      v: links[i].v,
      color: 0,
    }));

    // Crossing detection + greedy colouring (Welsh–Powell order).
    const conflict: Set<number>[] = edges.map(() => new Set());
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];
        if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v)
          continue;
        if (segmentsCross(e1.from, e1.to, e2.from, e2.to)) {
          conflict[i].add(j);
          conflict[j].add(i);
        }
      }
    }
    const cOrder = edges
      .map((_, i) => i)
      .sort((i, j) => conflict[j].size - conflict[i].size);
    for (const i of cOrder) {
      if (conflict[i].size === 0) {
        edges[i].color = 0;
        continue;
      }
      const used = new Set<number>();
      for (const j of conflict[i]) used.add(edges[j].color);
      let c = 1;
      while (used.has(c)) c++;
      edges[i].color = c;
    }

    return {
      nodes,
      edges,
      width: Math.max(totalW, 400),
      height: Math.max(cy + rowH, 300),
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

  const colorOf = (c: number) =>
    c === 0 ? token.colorPrimary : CROSS_COLORS[(c - 1) % CROSS_COLORS.length];
  const radius = new Map(nodes.map((n) => [n.id, n.r]));
  const radOf = (id: string) => radius.get(id) ?? 8;

  // A halo behind small text so it stays readable where it nears a line.
  const labelHalo = {
    paintOrder: "stroke" as const,
    stroke: token.colorBgContainer,
    strokeWidth: 3,
    strokeLinejoin: "round" as const,
  };

  return (
    <div style={{ maxHeight: "80vh", overflow: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", userSelect: "none" }}
      >
        {/* Layer 1: the links, coloured so crossing ones differ. */}
        {edges.map((e) => {
          const active = !hovered || e.a === hovered || e.b === hovered;
          return (
            <line
              key={e.key}
              x1={e.from.x}
              y1={e.from.y}
              x2={e.to.x}
              y2={e.to.y}
              stroke={colorOf(e.color)}
              strokeWidth={active ? 2.5 : 1.5}
              strokeOpacity={active ? 0.85 : 0.12}
            />
          );
        })}

        {/* Layer 2: the host nodes. */}
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
                fill={
                  n.id === hovered ? token.colorPrimary : token.colorPrimaryBg
                }
                stroke={token.colorPrimary}
                strokeWidth={2}
              />
              <text
                x={n.x}
                y={n.y + n.r + 16}
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

        {/* Layer 3: the port numbers, pushed off each line and drawn on top. */}
        {edges.map((e) => {
          const active = !hovered || e.a === hovered || e.b === hovered;
          const dx = e.to.x - e.from.x;
          const dy = e.to.y - e.from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const px = -uy; // perpendicular, to nudge labels off the wire
          const py = ux;
          const rA = radOf(e.a) + 22;
          const rB = radOf(e.b) + 22;
          const aPos = {
            x: e.from.x + ux * rA + px * 6,
            y: e.from.y + uy * rA + py * 6,
          };
          const bPos = {
            x: e.to.x - ux * rB + px * 6,
            y: e.to.y - uy * rB + py * 6,
          };
          return (
            <g key={e.key} opacity={active ? 1 : 0.12}>
              <text
                x={aPos.x}
                y={aPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill={colorOf(e.color)}
                style={labelHalo}
              >
                {e.portA}
              </text>
              <text
                x={bPos.x}
                y={bPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill={colorOf(e.color)}
                style={labelHalo}
              >
                {e.portB}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default RelationsMap;
