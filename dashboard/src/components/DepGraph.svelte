<script lang="ts">
  import { untrack } from 'svelte';
  import { layoutGraph, NODE_H, NODE_W } from '../lib/graph/layout';
  import {
    anyNodeVisible,
    autoFitView,
    clampView,
    containerHeight,
    fitView,
    isFullyVisible,
    panToContent,
    toViewBox,
    zoomAt,
    type View,
  } from '../lib/graph/view';
  import { dashboard } from '../lib/state.svelte';
  import { graphNodeBg, STATUS_EMOJI, TYPE_EMOJI, typeStyle } from '../lib/theme';
  import GraphControls from './GraphControls.svelte';
  import Minimap from './Minimap.svelte';

  const EMPTY_HEIGHT = 100;
  const DRAG_THRESHOLD = 4;
  const KEY_PAN = 60;
  const ZOOM_STEP = 1.25;

  // "Dim": lay out every task and grey out the ones the search and filters exclude, so the shape stays put
  const dim = $derived(dashboard.graphFiltered === 'dim');
  const shown = $derived(dim ? dashboard.tasks : dashboard.filtered);
  const matching = $derived(new Set(dashboard.filtered.map((t) => t.id)));
  const narrowed = $derived(dashboard.filtered.length < dashboard.tasks.length);
  const layout = $derived(layoutGraph(shown));
  const empty = $derived(shown.length === 0);
  const content = $derived({ w: layout.width, h: layout.height });
  // When the graph overflows, the initial view centers on the task in progress, else the next one to do
  const focus = $derived(
    layout.nodes.find((n) => matching.has(n.task.id) && n.task.status === 'in_progress') ??
      layout.nodes.find((n) => matching.has(n.task.id) && n.task.status === 'todo'),
  );

  let svg: SVGSVGElement;
  let vw = $state(0);
  let vh = $state(0);
  const viewport = $derived({ w: vw, h: vh });
  let view = $state<View>({ k: 1, x: 0, y: 0 });
  const active = $derived(dashboard.loaded && !empty && vw > 0 && vh > 0);

  // Only the first layout is fitted automatically (FR-6.3). While the view is still that automatic fit, resizing
  // or expanding the panel re-fits it. Once the user pans/zooms or the visible tasks change (filters, reloads), the
  // zoom level is kept; the view only pans when no task would be left on screen (FR-6.4).
  const nodeSize = { w: NODE_W, h: NODE_H };
  let fitted = false;
  let autoFit = true;
  let shownKey = '';

  $effect(() => {
    const key = dashboard.filtered.map((t) => t.id).join(',');
    if (!active) return;
    const current = untrack(() => view);
    if (!fitted) {
      // A saved position (FR-5.7) is used if some task is still on screen there; otherwise the automatic view
      const saved = dashboard.graphView ? clampView(dashboard.graphView, content, viewport) : null;
      if (saved && anyNodeVisible(saved, layout.nodes, nodeSize, viewport)) {
        view = saved;
        autoFit = false;
      } else {
        view = autoFitView(content, viewport, focus);
      }
      fitted = true;
    } else if (key !== shownKey) {
      autoFit = false;
      view = anyNodeVisible(current, layout.nodes, nodeSize, viewport)
        ? clampView(current, content, viewport)
        : panToContent(current, content, viewport, focus);
    } else {
      view = autoFit ? autoFitView(content, viewport, focus) : clampView(current, content, viewport);
    }
    shownKey = key;
  });

  function setView(v: View) {
    view = clampView(v, content, viewport);
    autoFit = false;
    dashboard.graphView = view; // saved with the project's view
  }

  const zoomBy = (factor: number) => setView(zoomAt(view, view.k * factor, vw / 2, vh / 2));
  const resetZoom = () => setView(zoomAt(view, 1, vw / 2, vh / 2));
  const fitAll = () => setView(fitView(content, viewport));

  // Drag to pan. Pointer capture starts only after a real drag, so plain clicks still open task details.
  let drag: { sx: number; sy: number; x: number; y: number; id: number; moved: boolean } | null = null;
  let panning = $state(false);
  let suppressClick = false;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !active) return;
    drag = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, id: e.pointerId, moved: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      svg.setPointerCapture(e.pointerId);
      panning = true;
    }
    setView({ k: view.k, x: drag.x + dx, y: drag.y + dy });
  }

  function endDrag() {
    if (drag?.moved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    drag = null;
    panning = false;
  }

  function onClickCapture(e: MouseEvent) {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms around the cursor; a plain wheel scrolls the page.
  // Registered manually: it must be non-passive to preventDefault.
  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !active) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      setView(zoomAt(view, view.k * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  function onKeydown(e: KeyboardEvent) {
    if (!active || e.ctrlKey || e.metaKey) return;
    const keys: Record<string, () => void> = {
      '+': () => zoomBy(ZOOM_STEP),
      '=': () => zoomBy(ZOOM_STEP),
      '-': () => zoomBy(1 / ZOOM_STEP),
      '0': resetZoom,
      f: fitAll,
      F: fitAll,
      ArrowLeft: () => setView({ ...view, x: view.x + KEY_PAN }),
      ArrowRight: () => setView({ ...view, x: view.x - KEY_PAN }),
      ArrowUp: () => setView({ ...view, y: view.y + KEY_PAN }),
      ArrowDown: () => setView({ ...view, y: view.y - KEY_PAN }),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (keyboard pan/zoom when focused) -->
<div
  class="graph-container"
  id="graph-container"
  tabindex="0"
  role="application"
  aria-label="Dependency graph"
  style:height={dashboard.loaded ? (empty ? EMPTY_HEIGHT : containerHeight(layout.height)) + 'px' : undefined}
  bind:clientWidth={vw}
  bind:clientHeight={vh}
  onkeydown={onKeydown}
>
  <svg
    bind:this={svg}
    id="dep-graph"
    class="dep-graph"
    class:panning
    role="presentation"
    viewBox={active ? toViewBox(view, viewport) : undefined}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onclickcapture={onClickCapture}
  >
    {#if dashboard.loaded}
      {#if empty}
        <text x="20" y="54" fill="var(--text-muted)" font-size="14">No tasks match current filters</text>
      {:else}
        <defs
          ><marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto"
            ><path d="M0,0 L10,3 L0,6 Z" fill="var(--text-muted)" /></marker
          ></defs
        >
        {#each layout.edges as edge (edge.from + '>' + edge.to)}
          <path
            d={edge.d}
            fill="none"
            stroke="var(--text-muted)"
            stroke-width="1.5"
            marker-end="url(#arrow)"
            class:graph-dimmed={!matching.has(edge.from) || !matching.has(edge.to)}
          />
        {/each}
        {#each layout.nodes as node (node.task.id)}
          {@const t = node.task}
          {@const ts = typeStyle(t.type)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g
            onclick={() => dashboard.showDetail(t.id)}
            style="cursor:pointer"
            class="graph-node"
            class:graph-dimmed={!matching.has(t.id)}
            data-id={t.id}
          >
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={NODE_H}
              rx="8"
              fill={graphNodeBg(t.type)}
              stroke={ts.color}
              stroke-width="1.5"
            />
            <text x={node.x + 8} y={node.y + 18} fill={ts.color} font-weight="700" font-size="12"
              >{`${STATUS_EMOJI[t.status] ?? ''} ${t.id} ${TYPE_EMOJI[t.type] ?? ''}`}</text
            >
            <text x={node.x + 8} y={node.y + 36} fill="var(--text-muted)" font-size="10" font-weight="400"
              >{node.label}</text
            >
          </g>
        {/each}
      {/if}
    {/if}
  </svg>
  {#if dashboard.loaded && !empty}
    <GraphControls k={view.k} onzoom={zoomBy} onfit={fitAll} onreset={resetZoom} {narrowed} />
    <Minimap
      nodes={layout.nodes}
      {nodeSize}
      {content}
      {view}
      {viewport}
      hidden={!active || isFullyVisible(view, content, viewport)}
      oncenter={(x, y) => setView({ k: view.k, x: vw / 2 - x * view.k, y: vh / 2 - y * view.k })}
    />
  {/if}
</div>
