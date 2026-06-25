"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PhaseFormRow } from "@/components/product-development/pd-phase-table";

const NODE_W = 168;
const NODE_H = 60;
const GAP_X = 88;
const GAP_Y = 28;
const PAD = 32;

type LinkKind = "depends_on" | "parallel_with";

interface MindMapEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
}

interface ActiveDrag {
  type: "move" | "link";
  nodeId: string;
  offsetX: number;
  offsetY: number;
  linkKind: LinkKind;
  pointerX: number;
  pointerY: number;
}

function rowId(row: PhaseFormRow): string {
  return row.id ?? row.clientId;
}

function dependsPathExists(
  phases: PhaseFormRow[],
  fromId: string,
  toId: string,
): boolean {
  const byId = new Map(phases.map((p) => [rowId(p), p]));
  const visited = new Set<string>();

  function walk(id: string): boolean {
    if (id === toId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const row = byId.get(id);
    if (!row) return false;
    return row.depends_on_phase_ids.some((dep) => walk(dep));
  }

  return walk(fromId);
}

function computeAutoLayout(phases: PhaseFormRow[]): Map<string, { x: number; y: number }> {
  const nodes = phases.filter((p) => p.name.trim());
  const depth = new Map<string, number>();

  function getDepth(id: string, visiting = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const row = nodes.find((r) => rowId(r) === id);
    if (!row || row.depends_on_phase_ids.length === 0) {
      depth.set(id, 0);
      return 0;
    }

    const d =
      Math.max(
        ...row.depends_on_phase_ids.map((dep) => getDepth(dep, visiting)),
      ) + 1;
    depth.set(id, d);
    return d;
  }

  for (const row of nodes) getDepth(rowId(row));

  const byDepth = new Map<number, string[]>();
  for (const row of nodes) {
    const d = depth.get(rowId(row)) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), rowId(row)]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const depths = [...byDepth.keys()].sort((a, b) => a - b);

  for (const d of depths) {
    const ids = byDepth.get(d) ?? [];
    ids.forEach((id, i) => {
      positions.set(id, {
        x: PAD + d * (NODE_W + GAP_X),
        y: PAD + i * (NODE_H + GAP_Y),
      });
    });
  }

  return positions;
}

function collectEdges(phases: PhaseFormRow[]): MindMapEdge[] {
  const edges: MindMapEdge[] = [];
  const seenParallel = new Set<string>();

  for (const row of phases) {
    const targetId = rowId(row);
    for (const depId of row.depends_on_phase_ids) {
      edges.push({
        id: `dep-${depId}-${targetId}`,
        fromId: depId,
        toId: targetId,
        kind: "depends_on",
      });
    }
    for (const parId of row.parallel_with_phase_ids) {
      const key = [targetId, parId].sort().join("|");
      if (seenParallel.has(key)) continue;
      seenParallel.add(key);
      edges.push({
        id: `par-${key}`,
        fromId: targetId,
        toId: parId,
        kind: "parallel_with",
      });
    }
  }

  return edges;
}

function applyLinkChange(
  phases: PhaseFormRow[],
  sourceId: string,
  targetId: string,
  kind: LinkKind,
  add: boolean,
): PhaseFormRow[] {
  return phases.map((row) => {
    const id = rowId(row);

    if (kind === "depends_on" && id === targetId) {
      const deps = add
        ? [...new Set([...row.depends_on_phase_ids, sourceId])]
        : row.depends_on_phase_ids.filter((d) => d !== sourceId);
      return { ...row, depends_on_phase_ids: deps };
    }

    if (kind === "parallel_with") {
      if (id === sourceId) {
        const list = add
          ? [...new Set([...row.parallel_with_phase_ids, targetId])]
          : row.parallel_with_phase_ids.filter((p) => p !== targetId);
        return { ...row, parallel_with_phase_ids: list };
      }
      if (id === targetId) {
        const list = add
          ? [...new Set([...row.parallel_with_phase_ids, sourceId])]
          : row.parallel_with_phase_ids.filter((p) => p !== sourceId);
        return { ...row, parallel_with_phase_ids: list };
      }
    }

    return row;
  });
}

function linkExists(
  phases: PhaseFormRow[],
  sourceId: string,
  targetId: string,
  kind: LinkKind,
): boolean {
  const target = phases.find((r) => rowId(r) === targetId);
  if (!target) return false;
  if (kind === "depends_on") {
    return target.depends_on_phase_ids.includes(sourceId);
  }
  return target.parallel_with_phase_ids.includes(sourceId);
}

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: LinkKind,
): string {
  const dx = Math.abs(x2 - x1);
  const curve = Math.min(80, dx * 0.45);
  if (kind === "parallel_with") {
    const midY = (y1 + y2) / 2 - 24;
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${midY} ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
}

function findNodeAtPoint(clientX: number, clientY: number): string | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const node = el.closest<HTMLElement>("[data-mindmap-node]");
    if (node?.dataset.nodeId) return node.dataset.nodeId;
  }
  return null;
}

interface PdPhaseMindMapProps {
  phases: PhaseFormRow[];
  onChange: (phases: PhaseFormRow[]) => void;
}

export function PdPhaseMindMap({ phases, onChange }: PdPhaseMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phasesRef = useRef(phases);
  const onChangeRef = useRef(onChange);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(),
  );
  const positionsRef = useRef(positions);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkKind>("depends_on");
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);

  phasesRef.current = phases;
  onChangeRef.current = onChange;
  positionsRef.current = positions;

  const visiblePhases = useMemo(
    () => phases.filter((p) => p.name.trim()),
    [phases],
  );

  const edges = useMemo(() => collectEdges(phases), [phases]);

  useEffect(() => {
    const auto = computeAutoLayout(phases);
    setPositions((prev) => {
      const next = new Map(prev);
      for (const [id, pos] of auto) {
        if (!next.has(id)) next.set(id, pos);
      }
      for (const key of next.keys()) {
        if (!auto.has(key)) next.delete(key);
      }
      return next;
    });
  }, [phases]);

  const canvasSize = useMemo(() => {
    let maxX = PAD + NODE_W;
    let maxY = PAD + NODE_H;
    for (const pos of positions.values()) {
      maxX = Math.max(maxX, pos.x + NODE_W + PAD);
      maxY = Math.max(maxY, pos.y + NODE_H + PAD);
    }
    return { width: maxX, height: maxY };
  }, [positions]);

  const clientToContainer = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const getNodeAnchor = useCallback(
    (id: string, side: "left" | "right" | "center" = "center") => {
      const pos = positions.get(id);
      if (!pos) return { x: 0, y: 0 };
      const y = pos.y + NODE_H / 2;
      if (side === "left") return { x: pos.x, y };
      if (side === "right") return { x: pos.x + NODE_W, y };
      return { x: pos.x + NODE_W / 2, y };
    },
    [positions],
  );

  const handleLinkDrop = useCallback(
    (sourceId: string, targetId: string, kind: LinkKind) => {
      if (sourceId === targetId) return;

      const currentPhases = phasesRef.current;

      const exists = linkExists(currentPhases, sourceId, targetId, kind);
      if (exists) {
        onChangeRef.current(
          applyLinkChange(currentPhases, sourceId, targetId, kind, false),
        );
        setLinkFeedback("Link removed");
        return;
      }

      if (
        kind === "depends_on" &&
        dependsPathExists(currentPhases, sourceId, targetId)
      ) {
        setLinkFeedback("Cannot link — would create a circular dependency");
        return;
      }

      onChangeRef.current(
        applyLinkChange(currentPhases, sourceId, targetId, kind, true),
      );
      setLinkFeedback(
        kind === "depends_on"
          ? "Dependency added"
          : "Parallel link added",
      );
    },
    [],
  );

  useEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const drag = activeDragRef.current;
      if (!drag) return;

      const pt = clientToContainer(e.clientX, e.clientY);

      if (drag.type === "move") {
        const x = pt.x - drag.offsetX;
        const y = pt.y - drag.offsetY;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(drag.nodeId, {
            x: Math.max(0, x),
            y: Math.max(0, y),
          });
          return next;
        });
        return;
      }

      const nextDrag = { ...drag, pointerX: pt.x, pointerY: pt.y };
      activeDragRef.current = nextDrag;
      setActiveDrag(nextDrag);

      const targetId = findNodeAtPoint(e.clientX, e.clientY);
      setHoverNodeId(
        targetId && targetId !== drag.nodeId ? targetId : null,
      );
    }

    function onPointerUp(e: PointerEvent) {
      const drag = activeDragRef.current;
      if (!drag) return;

      if (drag.type === "link") {
        const targetId = findNodeAtPoint(e.clientX, e.clientY);
        if (targetId && targetId !== drag.nodeId) {
          handleLinkDrop(drag.nodeId, targetId, drag.linkKind);
        }
      }

      activeDragRef.current = null;
      setActiveDrag(null);
      setHoverNodeId(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [clientToContainer, handleLinkDrop]);

  useEffect(() => {
    if (!linkFeedback) return;
    const timer = window.setTimeout(() => setLinkFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [linkFeedback]);

  const startMove = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = positionsRef.current.get(id);
    if (!pos) return;
    const pt = clientToContainer(e.clientX, e.clientY);
    setActiveDrag({
      type: "move",
      nodeId: id,
      offsetX: pt.x - pos.x,
      offsetY: pt.y - pos.y,
      linkKind: linkMode,
      pointerX: pt.x,
      pointerY: pt.y,
    });
    activeDragRef.current = {
      type: "move",
      nodeId: id,
      offsetX: pt.x - pos.x,
      offsetY: pt.y - pos.y,
      linkKind: linkMode,
      pointerX: pt.x,
      pointerY: pt.y,
    };
  };

  const startLink = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const anchor = getNodeAnchor(id, "right");
    const drag: ActiveDrag = {
      type: "link",
      nodeId: id,
      offsetX: 0,
      offsetY: 0,
      linkKind: linkMode,
      pointerX: anchor.x,
      pointerY: anchor.y,
    };
    activeDragRef.current = drag;
    setActiveDrag(drag);
    setLinkFeedback(null);
  };

  const handleEdgeClick = (edge: MindMapEdge) => {
    onChange(applyLinkChange(phases, edge.fromId, edge.toId, edge.kind, false));
    setLinkFeedback("Link removed");
  };

  if (visiblePhases.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-500">
        Name your tasks to see the relationship map.
      </p>
    );
  }

  const linkStart = activeDrag?.type === "link"
    ? getNodeAnchor(activeDrag.nodeId, "right")
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <span className="font-medium text-stone-700">Link mode:</span>
        <button
          type="button"
          onClick={() => setLinkMode("depends_on")}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            linkMode === "depends_on"
              ? "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-500/40"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200",
          )}
        >
          Depends on
        </button>
        <button
          type="button"
          onClick={() => setLinkMode("parallel_with")}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            linkMode === "parallel_with"
              ? "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-500/40"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200",
          )}
        >
          Parallel with
        </button>
        <span className="text-stone-400">·</span>
        <span>
          Drag a task body to move it. Drag the{" "}
          <span className="inline-block h-2 w-2 rounded-full bg-stone-500 align-middle" />{" "}
          handle onto another task to link. Click a line to remove it.
        </span>
      </div>

      {linkFeedback && (
        <p className="text-xs font-medium text-emerald-700">{linkFeedback}</p>
      )}

      <div className="overflow-auto rounded-lg border border-stone-200 bg-stone-50/50">
        <div
          ref={containerRef}
          className="relative touch-none select-none"
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            minWidth: "100%",
            minHeight: 280,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            {edges.map((edge) => {
              const from = getNodeAnchor(edge.fromId, "right");
              const to = getNodeAnchor(
                edge.toId,
                edge.kind === "parallel_with" ? "center" : "left",
              );
              const d = edgePath(from.x, from.y, to.x, to.y, edge.kind);
              const color =
                edge.kind === "depends_on" ? "#0284c7" : "#7c3aed";
              return (
                <g
                  key={edge.id}
                  className={cn(
                    "cursor-pointer",
                    activeDrag?.type === "link"
                      ? "pointer-events-none"
                      : "pointer-events-auto",
                  )}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    onClick={() => handleEdgeClick(edge)}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={edge.kind === "parallel_with" ? 2 : 2.5}
                    strokeDasharray={
                      edge.kind === "parallel_with" ? "6 4" : undefined
                    }
                    markerEnd={
                      edge.kind === "depends_on"
                        ? "url(#pd-arrow)"
                        : undefined
                    }
                    opacity={0.85}
                    onClick={() => handleEdgeClick(edge)}
                  />
                </g>
              );
            })}

            {activeDrag?.type === "link" && linkStart && (
              <path
                d={edgePath(
                  linkStart.x,
                  linkStart.y,
                  activeDrag.pointerX,
                  activeDrag.pointerY,
                  activeDrag.linkKind,
                )}
                fill="none"
                stroke={
                  activeDrag.linkKind === "depends_on" ? "#0284c7" : "#7c3aed"
                }
                strokeWidth={2.5}
                strokeDasharray="5 4"
                opacity={0.75}
              />
            )}

            <defs>
              <marker
                id="pd-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" />
              </marker>
            </defs>
          </svg>

          {visiblePhases.map((row) => {
            const id = rowId(row);
            const pos = positions.get(id);
            if (!pos) return null;
            const isHover = hoverNodeId === id;
            const isLinkSource =
              activeDrag?.type === "link" && activeDrag.nodeId === id;
            const isMoving =
              activeDrag?.type === "move" && activeDrag.nodeId === id;

            return (
              <div
                key={id}
                data-mindmap-node
                data-node-id={id}
                className={cn(
                  "absolute flex cursor-grab items-start rounded-lg border bg-white px-3 py-2 shadow-sm",
                  row.is_parent
                    ? "border-stone-300 font-semibold"
                    : "border-stone-200",
                  isHover && "ring-2 ring-emerald-400/70",
                  isLinkSource && "ring-2 ring-sky-400/70",
                  isMoving && "z-10 cursor-grabbing shadow-md",
                )}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                }}
                onPointerDown={(e) => startMove(e, id)}
              >
                <p className="pointer-events-none min-w-0 flex-1 break-words text-xs leading-snug text-stone-900 line-clamp-2">
                  {row.name}
                </p>
                <button
                  type="button"
                  title={
                    linkMode === "depends_on"
                      ? "Drag onto a task that should start after this one"
                      : "Drag onto a task that runs in parallel"
                  }
                  className="ml-1.5 mt-0.5 flex h-6 w-6 shrink-0 cursor-crosshair items-center justify-center rounded-full border border-stone-300 bg-stone-50 hover:border-sky-400 hover:bg-sky-50 active:bg-sky-100"
                  onPointerDown={(e) => startLink(e, id)}
                >
                  <span className="pointer-events-none h-2.5 w-2.5 rounded-full bg-stone-500" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
