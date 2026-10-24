<script lang="ts">
  import { formatMinutes } from '../lib/format';
  import type { ActivitySeries } from '../lib/insights';
  import { typeStyle } from '../lib/theme';
  import { formatDate, formatDateTime } from '../lib/timeline';

  // Four small multiples on one time axis (never one chart with two y-scales): completions per period with their
  // rolling average, cumulative done vs scope, cycle time per task, and work in progress. Hovering anywhere shows a
  // crosshair through all of them and the values for that period.
  let { series }: { series: ActivitySeries } = $props();

  const W = 640;
  const PAD_L = 34;
  const PAD_R = 8;
  const H = 64;
  const plotW = W - PAD_L - PAD_R;
  const b = $derived(series.buckets);
  const n = $derived(b.length);
  const x = (i: number) => PAD_L + (i + 0.5) * (plotW / n);
  const xt = (t: number) => PAD_L + ((t - b[0].start) / (b[n - 1].end - b[0].start)) * plotW;
  const scale = (max: number) => (v: number) => H - 4 - (v / Math.max(1, max)) * (H - 10);

  const maxDone = $derived(Math.max(1, ...b.map((x) => x.completed.length)));
  const yDone = $derived(scale(maxDone));
  const maxScope = $derived(Math.max(1, ...b.map((x) => x.scope)));
  const yScope = $derived(scale(maxScope));
  const maxCycle = $derived(Math.max(1, ...series.cycleTimes.map((c) => c.minutes)));
  const yCycle = $derived(scale(maxCycle));
  const maxWip = $derived(Math.max(1, ...b.map((x) => x.wip)));
  const yWip = $derived(scale(maxWip));

  const line = (values: number[], y: (v: number) => number) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const step = (values: number[], y: (v: number) => number) =>
    values
      .map((v, i) => {
        const x0 = PAD_L + i * (plotW / n);
        const x1 = x0 + plotW / n;
        return `${i ? 'L' : 'M'}${x0.toFixed(1)},${y(v).toFixed(1)} L${x1.toFixed(1)},${y(v).toFixed(1)}`;
      })
      .join(' ');

  const short = $derived(series.bucketMs < 86_400_000);
  const when = (t: number) => (short ? formatDateTime(t) : formatDate(t));
  const peak = $derived(b.reduce((best, x) => (x.completed.length > best.completed.length ? x : best), b[0]));
  const wipNow = $derived(b[n - 1].wip);

  let hover = $state<number | null>(null);
  function onMove(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor(((px - PAD_L) / plotW) * n);
    hover = i >= 0 && i < n ? i : null;
  }
  const hb = $derived(hover === null ? null : b[hover]);
</script>

<div class="kpi-row">
  <div class="kpi"><span class="kpi-value">{series.totalCompleted}</span><span class="kpi-label">completed</span></div>
  <div class="kpi">
    <span class="kpi-value">{peak.completed.length}</span><span class="kpi-label">best {series.unitLabel}</span>
  </div>
  <div class="kpi">
    <span class="kpi-value">{series.medianCycleMinutes === null ? '–' : formatMinutes(series.medianCycleMinutes)}</span
    ><span class="kpi-label">median cycle time</span>
  </div>
  <div class="kpi"><span class="kpi-value">{wipNow}</span><span class="kpi-label">in progress</span></div>
</div>

<div class="type-legend" aria-label="Completed by type">
  {#each series.types as t (t.type)}
    <span class="type-chip"
      ><span class="legend-swatch" style="background:{typeStyle(t.type).color}"></span>{t.type}<strong>{t.count}</strong
      ></span
    >
  {/each}
</div>

<div class="deep-dive">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    class="deep-dive-chart"
    viewBox="0 0 {W} {4 * (H + 22) + 20}"
    width="100%"
    onpointermove={onMove}
    onpointerleave={() => (hover = null)}
  >
    {#snippet panel(index: number, title: string, max: number, unit: string)}
      <g transform="translate(0 {index * (H + 22)})">
        <text x={PAD_L} y="12" class="chart-title">{title}</text>
        <g transform="translate(0 16)">
          <line x1={PAD_L} x2={W - PAD_R} y1={H - 4} y2={H - 4} class="chart-axis" />
          <line x1={PAD_L} x2={W - PAD_R} y1="6" y2="6" class="chart-grid" />
          <text x={PAD_L - 6} y="9" class="chart-tick" text-anchor="end">{max}{unit}</text>
          <text x={PAD_L - 6} y={H - 1} class="chart-tick" text-anchor="end">0</text>
        </g>
      </g>
    {/snippet}

    {@render panel(0, `Completed per ${series.unitLabel}, by type`, maxDone, '')}
    <g transform="translate(0 16)">
      <!-- Completions stacked by task type (most completed type at the bottom), in the type colours -->
      {#each b as bucket, i (bucket.start)}
        {@const segments = series.types.filter((t) => bucket.byType[t.type])}
        {#each segments as seg, j (seg.type)}
          {@const below = segments.slice(0, j).reduce((sum, t) => sum + bucket.byType[t.type], 0)}
          <rect
            x={PAD_L + i * (plotW / n) + 1}
            y={yDone(below + bucket.byType[seg.type])}
            width={Math.max(1, plotW / n - 2)}
            height={Math.max(1, yDone(below) - yDone(below + bucket.byType[seg.type]) - (j > 0 ? 1 : 0))}
            rx="1.5"
            fill={typeStyle(seg.type).color}
            opacity={hover === null || hover === i ? 1 : 0.6}
          />
        {/each}
      {/each}
      <path
        d={line(
          b.map((x) => x.average),
          yDone,
        )}
        fill="none"
        stroke="var(--series-scope)"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </g>

    {@render panel(1, 'Done vs scope', maxScope, '')}
    <g transform="translate(0 {H + 22 + 16})">
      <path
        d={step(
          b.map((x) => x.scope),
          yScope,
        )}
        fill="none"
        stroke="var(--series-scope)"
        stroke-width="2"
      />
      <path
        d={step(
          b.map((x) => x.cumulativeDone),
          yScope,
        ) + ` L${W - PAD_R},${H - 4} L${PAD_L},${H - 4} Z`}
        fill="color-mix(in srgb, var(--series-remaining) 18%, transparent)"
        stroke="none"
      />
      <path
        d={step(
          b.map((x) => x.cumulativeDone),
          yScope,
        )}
        fill="none"
        stroke="var(--series-remaining)"
        stroke-width="2"
      />
    </g>

    {@render panel(2, 'Cycle time per task (start → done)', Math.round(maxCycle), ' m')}
    <g transform="translate(0 {2 * (H + 22) + 16})">
      {#if series.medianCycleMinutes !== null}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yCycle(series.medianCycleMinutes)}
          y2={yCycle(series.medianCycleMinutes)}
          class="chart-median"
        />
        <text x={PAD_L + 4} y={yCycle(series.medianCycleMinutes) - 4} class="chart-tick"
          >median {formatMinutes(series.medianCycleMinutes)}</text
        >
      {/if}
      {#each series.cycleTimes as c (c.id)}
        <circle
          cx={xt(c.time)}
          cy={yCycle(c.minutes)}
          r="4"
          fill="var(--series-remaining)"
          stroke="var(--surface)"
          stroke-width="2"><title>{c.id} {c.name}: {formatMinutes(c.minutes)}</title></circle
        >
      {:else}
        <text x={PAD_L + plotW / 2} y={H / 2} class="chart-tick" text-anchor="middle"
          >No tasks with both started_at and completed_at yet</text
        >
      {/each}
    </g>

    {@render panel(3, 'Work in progress', maxWip, '')}
    <g transform="translate(0 {3 * (H + 22) + 16})">
      <path
        d={step(
          b.map((x) => x.wip),
          yWip,
        ) + ` L${W - PAD_R},${H - 4} L${PAD_L},${H - 4} Z`}
        fill="color-mix(in srgb, var(--accent) 22%, transparent)"
      />
      <path
        d={step(
          b.map((x) => x.wip),
          yWip,
        )}
        fill="none"
        stroke="var(--accent)"
        stroke-width="2"
      />
    </g>

    <g transform="translate(0 {4 * (H + 22) + 10})">
      <text x={PAD_L} y="0" class="chart-tick">{when(b[0].start)}</text>
      <text x={W - PAD_R} y="0" class="chart-tick" text-anchor="end">{when(b[n - 1].end)}</text>
    </g>

    {#if hover !== null}
      <line x1={x(hover)} x2={x(hover)} y1="16" y2={4 * (H + 22)} class="chart-crosshair" />
    {/if}
  </svg>

  <div class="deep-dive-legend">
    <span><span class="legend-line" style="background:var(--series-scope)"></span>3-period average</span>
    <span><span class="legend-swatch" style="background:var(--series-remaining)"></span>Done</span>
    <span><span class="legend-line" style="background:var(--series-scope)"></span>Scope</span>
    <span><span class="legend-swatch" style="background:var(--series-remaining)"></span>Cycle time</span>
    <span><span class="legend-swatch" style="background:var(--accent)"></span>In progress</span>
  </div>

  {#if hb}
    <!-- On the side away from the cursor, so it never hides the period being read -->
    <div class="deep-dive-tooltip" class:left={hover !== null && hover >= n / 2}>
      <div class="tooltip-title">{when(hb.start)} – {when(hb.end)}</div>
      <div><strong>{hb.completed.length}</strong> completed (avg {hb.average.toFixed(1)})</div>
      {#each series.types.filter((t) => hb.byType[t.type]) as t (t.type)}
        <div class="tooltip-type">
          <span class="legend-dot" style="background:{typeStyle(t.type).color}"></span>{t.type}
          <strong>{hb.byType[t.type]}</strong>
        </div>
      {/each}
      <div><strong>{hb.cumulativeDone}</strong> of {hb.scope} done</div>
      <div><strong>{hb.wip}</strong> in progress</div>
      {#each hb.completed.slice(0, 5) as c (c.id)}<div class="tooltip-task">{c.id} {c.name}</div>{/each}
      {#if hb.completed.length > 5}<div class="tooltip-task">+{hb.completed.length - 5} more</div>{/if}
    </div>
  {/if}
</div>
