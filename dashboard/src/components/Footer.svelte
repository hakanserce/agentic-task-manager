<script lang="ts">
  import { copyright, pluginInfo } from '../lib/plugin-info';
  import { dashboard } from '../lib/state.svelte';
</script>

<footer class="site-footer" id="site-footer">
  <span class="footer-copyright">{copyright(pluginInfo)}</span>
  <nav class="footer-links" aria-label="About this dashboard">
    <button class="footer-link" id="footer-version" title="What's new" onclick={() => dashboard.openWhatsNew()}
      >v{pluginInfo.version}</button
    >
    <a class="footer-link" id="footer-github" href={pluginInfo.repository} target="_blank" rel="noopener noreferrer"
      >GitHub</a
    >
  </nav>
</footer>
