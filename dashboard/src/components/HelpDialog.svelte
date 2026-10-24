<script lang="ts">
  import help from 'virtual:atm-help';
  import { dashboard } from '../lib/state.svelte';
  import Dialog from './Dialog.svelte';
  import Markdown from './Markdown.svelte';
</script>

<!-- docs/help.md, parsed at build time (build/help.ts) -->
<Dialog id="help" title="Help" open={dashboard.dialog === 'help'} onclose={() => dashboard.closeDialog()}>
  <Markdown blocks={help} idPrefix="help-" />
</Dialog>
