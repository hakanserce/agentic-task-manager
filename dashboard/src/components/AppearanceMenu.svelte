<script lang="ts">
  import { MODE_LABELS, MODE_PREFS, THEMES, type ModePref } from '../lib/appearance';
  import type { IconName } from '../lib/icons';
  import { dashboard } from '../lib/state.svelte';
  import Icon from './Icon.svelte';

  // Compact: one button with the current mode's icon and the theme's swatch; the menu holds the choices.
  const MODE_ICONS: Record<ModePref, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };
  const current = $derived(THEMES.find((t) => t.id === dashboard.theme) ?? THEMES[0]);
  let open = $state(false);
  let root: HTMLElement;

  function onWindowClick(e: MouseEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="menu-anchor appearance" bind:this={root}>
  <button
    class="menu-trigger"
    id="appearance-btn"
    aria-haspopup="true"
    aria-expanded={open}
    title="Theme: {current.name} · Mode: {MODE_LABELS[dashboard.modePref]}"
    onclick={() => (open = !open)}
  >
    <Icon name={MODE_ICONS[dashboard.modePref]} />
    <span class="swatch-dots" aria-hidden="true">
      {#each current.swatch.slice(1) as c (c)}<span style="background:{c}"></span>{/each}
    </span>
    <Icon name="chevron-down" size={14} />
  </button>
  {#if open}
    <div class="menu" id="appearance-menu" role="dialog" aria-label="Appearance">
      <div class="menu-label">Mode</div>
      <div class="mode-switch" role="group" aria-label="Color mode" id="mode-control">
        {#each MODE_PREFS as pref (pref)}
          <button
            class="mode-btn"
            class:active={dashboard.modePref === pref}
            data-mode={pref}
            aria-pressed={dashboard.modePref === pref}
            onclick={() => dashboard.setModePref(pref)}
            ><Icon name={MODE_ICONS[pref]} size={14} /> {MODE_LABELS[pref]}</button
          >
        {/each}
      </div>
      <div class="menu-label">Theme</div>
      <div class="theme-list" role="radiogroup" aria-label="Theme">
        {#each THEMES as theme (theme.id)}
          <button
            class="theme-option"
            class:active={dashboard.theme === theme.id}
            data-theme={theme.id}
            role="radio"
            aria-checked={dashboard.theme === theme.id}
            onclick={() => dashboard.setTheme(theme.id)}
          >
            <span class="theme-swatch" aria-hidden="true">
              {#each theme.swatch as c (c)}<span style="background:{c}"></span>{/each}
            </span>
            <span class="theme-name">{theme.name}</span>
            {#if dashboard.theme === theme.id}<Icon name="check" size={14} />{/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
