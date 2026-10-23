<script lang="ts">
  import { dashboard } from '../lib/state.svelte';

  // Like the legacy dashboard, the interval only applies on "change" (blur/enter), not on every keystroke
  function onIntervalChange(e: Event) {
    dashboard.setAutoRefreshSeconds(parseInt((e.currentTarget as HTMLInputElement).value) || 5);
  }

  $effect(() => {
    if (!dashboard.autoRefresh) return;
    const timer = setInterval(() => dashboard.reload(), dashboard.autoRefreshSeconds * 1000);
    return () => clearInterval(timer);
  });
</script>

<button
  class="reload-btn"
  class:spinning={dashboard.reloading}
  id="reload-btn"
  title="Reload tasks.json"
  onclick={() => dashboard.reload()}><span class="icon">&#x21bb;</span> Reload</button
>
<label class="auto-refresh-toggle" title="Auto-refresh tasks.json"
  ><input
    type="checkbox"
    id="auto-refresh-check"
    checked={dashboard.autoRefresh}
    onchange={(e) => dashboard.setAutoRefresh(e.currentTarget.checked)}
  /><span class="toggle-track"></span> Auto</label
>
<input
  type="number"
  class="auto-refresh-interval"
  id="auto-refresh-interval"
  value={dashboard.autoRefreshSeconds}
  min="1"
  max="300"
  title="Interval in seconds"
  onchange={onIntervalChange}
/>
<span style="font-size:12px;color:var(--text-muted)">s</span>
