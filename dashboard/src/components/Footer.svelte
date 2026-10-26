<script lang="ts">
  import { archiveNotice } from '../lib/archive';
  import { copyright, pluginInfo } from '../lib/plugin-info';
  import { dashboard } from '../lib/state.svelte';
  import Logo from './Logo.svelte';

  // tasks.json has grown past the archive threshold (D-5.4); agents act on the same hint from atm
  const notice = $derived(
    archiveNotice(dashboard.tasks, dashboard.meta, dashboard.tasksBytes, dashboard.loadedAt, dashboard.vocab),
  );
</script>

<footer class="site-footer" id="site-footer">
  <span class="footer-start">
    <span class="footer-brand" id="footer-brand"
      ><Logo size={16} id="footer-logo" />{pluginInfo.fullName} ({pluginInfo.name})</span
    >
    <span class="footer-copyright">{copyright(pluginInfo)}</span>
  </span>
  {#if notice}<span class="archive-notice" id="archive-notice">{notice}</span>{/if}
  <nav class="footer-links" aria-label="About this dashboard">
    <button class="footer-link" id="footer-version" title="What's new" onclick={() => dashboard.openWhatsNew()}
      >v{pluginInfo.version}</button
    >
    <a class="footer-link" id="footer-github" href={pluginInfo.repository} target="_blank" rel="noopener noreferrer"
      >GitHub</a
    >
    <button class="footer-link" id="footer-help" onclick={() => dashboard.openDialog('help')}>Help</button>
    <button class="footer-link" id="footer-about" onclick={() => dashboard.openDialog('about')}>About</button>
  </nav>
</footer>
