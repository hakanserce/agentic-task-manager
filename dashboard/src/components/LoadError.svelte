<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
</script>

<!-- Shown instead of the views when tasks.json could not be loaded at all -->
{#if !dashboard.loaded && dashboard.loadError !== null}
  <div
    id="load-error"
    role="alert"
    style="background:var(--surface);border:1px solid var(--red);border-radius:8px;padding:24px;color:var(--red)"
  >
    <strong>Failed to load tasks.json</strong><br />
    <span style="color:var(--text-muted)"
      >{dashboard.loadError}<br /><br />The dashboard must be served over HTTP. Start a local server:<br /><code
        style="color:var(--text)">python3 -m http.server 8000</code
      ><br />then open <code style="color:var(--accent)">http://localhost:8000/tasks-dashboard.html</code></span
    >
  </div>
{/if}
