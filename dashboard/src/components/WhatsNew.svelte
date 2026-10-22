<script lang="ts">
  import { UNRELEASED } from '../lib/changelog';
  import { releaseNotes } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';

  /** Split `code` spans out of an item so they can be styled; everything stays plain text. */
  function segments(item: string) {
    return item.split('`').map((text, i) => ({ text, code: i % 2 === 1 }));
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) dashboard.closeWhatsNew();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dashboard.closeWhatsNew();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Escape closes, see above) -->
<div class="detail-overlay" class:open={dashboard.whatsNewOpen} id="whats-new-overlay" onclick={onOverlayClick}>
  <div class="detail-panel whats-new" id="whats-new-panel" role="dialog" aria-label="What's new">
    <button class="detail-close" aria-label="Close" onclick={() => dashboard.closeWhatsNew()}>&times;</button>
    <h3>What's new</h3>
    {#each releaseNotes as entry (entry.version)}
      <section class="release" data-version={entry.version}>
        <h4>
          {entry.version === UNRELEASED ? 'Unreleased' : 'v' + entry.version}{#if entry.date}<span class="release-date"
              >{entry.date}</span
            >{/if}
        </h4>
        {#each entry.sections as section, i (i)}
          {#if section.title}<div class="release-section">{section.title}</div>{/if}
          <ul>
            {#each section.items as item, j (j)}
              <li>
                {#each segments(item) as seg, k (k)}{#if seg.code}<code>{seg.text}</code>{:else}{seg.text}{/if}{/each}
              </li>
            {/each}
          </ul>
        {/each}
      </section>
    {/each}
  </div>
</div>
