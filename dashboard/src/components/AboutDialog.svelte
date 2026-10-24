<script lang="ts">
  import { pluginInfo } from '../lib/plugin-info';
  import { dashboard } from '../lib/state.svelte';
  import Dialog from './Dialog.svelte';
</script>

<Dialog id="about" title="About" open={dashboard.dialog === 'about'} onclose={() => dashboard.closeDialog()}>
  <p class="about-name">{pluginInfo.name}</p>
  <p class="about-description">{pluginInfo.description}</p>
  <dl class="about-facts">
    <dt>Version</dt>
    <dd>{pluginInfo.version}</dd>
    <dt>Author</dt>
    <dd>{pluginInfo.author}</dd>
    <dt>Licence</dt>
    <dd>{pluginInfo.license}</dd>
    <dt>Source</dt>
    <dd><a href={pluginInfo.repository} target="_blank" rel="noopener noreferrer">{pluginInfo.repository}</a></dd>
  </dl>
</Dialog>
