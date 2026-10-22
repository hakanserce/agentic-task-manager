<script lang="ts">
  import { layoutGraph, NODE_H, NODE_W } from '../lib/graph/layout';
  import { dashboard } from '../lib/state.svelte';
  import { graphNodeBg, STATUS_EMOJI, TYPE_EMOJI, typeStyle } from '../lib/theme';

  const MAX_MIN_HEIGHT = 600;

  const layout = $derived(layoutGraph(dashboard.filtered));
  const empty = $derived(dashboard.filtered.length === 0);
  // Legacy scales the SVG to the page width via viewBox (zoom/pan replaces this in phase 6)
  const viewBox = $derived(
    !dashboard.loaded ? undefined : empty ? '0 0 400 50' : `0 0 ${layout.width} ${layout.height}`,
  );
  const minHeight = $derived(
    !dashboard.loaded ? undefined : empty ? '50px' : Math.min(layout.height, MAX_MIN_HEIGHT) + 'px',
  );
</script>

<div class="graph-section" id="graph-section">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="phase-header" onclick={() => (dashboard.graphCollapsed = !dashboard.graphCollapsed)}>
    <span class="chevron" id="graph-chevron" style:transform={dashboard.graphCollapsed ? 'rotate(-90deg)' : undefined}
      >&#9660;</span
    >
    <h2>Dependency Graph</h2>
    <span class="phase-badge" style="background:var(--accent)20;color:var(--accent)" id="graph-badge"
      >{dashboard.loaded ? dashboard.filtered.length + ' tasks' : 'interactive'}</span
    >
  </div>
  <div class="graph-container" id="graph-container" style:display={dashboard.graphCollapsed ? 'none' : undefined}>
    <svg id="dep-graph" class="dep-graph" {viewBox} style:min-height={minHeight}>
      {#if dashboard.loaded}
        {#if empty}
          <text x="20" y="30" fill="var(--text-muted)" font-size="14">No tasks match current filters</text>
        {:else}
          <defs
            ><marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto"
              ><path d="M0,0 L10,3 L0,6 Z" fill="var(--text-muted)" /></marker
            ></defs
          >
          {#each layout.edges as edge (edge.from + '>' + edge.to)}
            <path d={edge.d} fill="none" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#arrow)" />
          {/each}
          {#each layout.nodes as node (node.task.id)}
            {@const t = node.task}
            {@const ts = typeStyle(t.type)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g onclick={() => dashboard.showDetail(t.id)} style="cursor:pointer">
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
  </div>
</div>
