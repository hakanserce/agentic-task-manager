<script lang="ts">
  import { shortAgent } from '../lib/claims';
  import { formatMinutes } from '../lib/format';
  import { dashboard } from '../lib/state.svelte';
  import { days, utilization, WORKDAY_HOURS } from '../lib/utilization';

  let { now }: { now: number } = $props();

  // Work of the matching tasks, over the whole project's period (first start to now). From the history, like the
  // burndown above it: archiving finished tasks doesn't shrink the work or the period (T-238)
  const u = $derived(utilization(dashboard.historyFiltered, dashboard.claims, now, dashboard.history, dashboard.vocab));
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const hours = (msSpan: number) => formatMinutes(msSpan / 60_000);
  const span = (msSpan: number) => {
    const d = days(msSpan);
    return d >= 1 ? `${d.toFixed(1)} days` : hours(msSpan);
  };
  // Bars are drawn up to 100%; beyond that (several agents in parallel) the bar is full and marked
  const width = (r: number) => `${Math.min(100, r * 100)}%`;
</script>

{#snippet meter(ratio: number, label: string)}
  <span class="util-meter" title="{label}: {pct(ratio)}">
    <span class="util-fill" class:over={ratio > 1} style:width={width(ratio)}></span>
  </span>
  <span class="util-pct">{pct(ratio)}</span>
{/snippet}

{#if u}
  <section class="utilization" id="utilization" aria-labelledby="utilization-title">
    <h3 class="section-title" id="utilization-title">Agent utilisation</h3>
    <p class="progress-basis">
      {hours(u.workMs)} of agent work over {span(u.calendarMs)} since the first task started. Parallel agents add up, so more
      than 100% means several agents at once.
    </p>
    <div class="util-cards">
      <div class="util-card" id="util-daily">
        <div class="util-value">{pct(u.daily)}</div>
        <div class="util-label">of calendar time <span>24 h a day, every day</span></div>
        {@render meter(u.daily, '24/7')}
      </div>
      <div class="util-card" id="util-workday">
        <div class="util-value">{pct(u.workday)}</div>
        <div class="util-label">of working time <span>{WORKDAY_HOURS} h a day, Monday to Friday</span></div>
        {@render meter(u.workday, 'Working days')}
      </div>
    </div>
    {#if u.agents.length > 1 || u.agents[0]?.agent}
      <table class="phase-table util-table">
        <thead>
          <tr><th>Agent</th><th>Work</th><th>24/7</th><th>Working days</th></tr>
        </thead>
        <tbody>
          {#each u.agents as a (a.agent)}
            <tr data-agent={a.agent}>
              <td>{a.agent ? shortAgent(a.agent) : 'Unattributed'}</td>
              <td>{hours(a.workMs)}</td>
              <td class="util-cell">{@render meter(a.daily, '24/7')}</td>
              <td class="util-cell">{@render meter(a.workday, 'Working days')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}
