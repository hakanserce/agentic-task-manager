<script lang="ts">
  import { formatMinutes } from '../lib/format';
  import { actors, vocabCounts, workflowOf } from '../lib/projectinfo';
  import { repositoryOf } from '../lib/repo';
  import { dashboard } from '../lib/state.svelte';
  import InfoTip from './InfoTip.svelte';
  import ProjectLogo from './ProjectLogo.svelte';

  // The project as a whole (docs/project-stats-proposal.md, T-252): who worked on it, how it pushes, and its
  // vocabularies, Information on the left; Stats on the right (T-253). From the history, archived tasks too, and
  // whatever the search and filters: it describes the project, not the slice on screen.
  $effect(() => {
    if (dashboard.archivedCount > 0) dashboard.wantArchive();
  });
  const tasks = $derived(dashboard.history);
  const vocab = $derived(dashboard.vocab);
  // Recomputed with every reload of the tasks
  const now = $derived.by(() => {
    void tasks;
    return Date.now();
  });

  const project = $derived({
    id: dashboard.projectId ?? '',
    name: dashboard.projectName,
    logo: dashboard.projects.find((p) => p.id === dashboard.projectId)?.logo,
  });
  const description = $derived(typeof dashboard.meta?.description === 'string' ? dashboard.meta.description : '');
  const repository = $derived(repositoryOf(dashboard.meta));
  const workflow = $derived(workflowOf(dashboard.meta));
  const who = $derived(actors(tasks, now, vocab));
  const counts = $derived(vocabCounts(tasks, vocab));
  // Finished phases fold away, like on the Progress tab
  let showFinished = $state(false);
  const finished = $derived(counts.phases.filter((p) => p.state === 'done'));
  const phases = $derived(showFinished ? counts.phases : counts.phases.filter((p) => p.state !== 'done'));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<div class="project-view" id="project">
  <header class="project-head">
    <ProjectLogo {project} size={40} />
    <div>
      <h2 class="project-title">
        <span id="project-name">{project.name}</span>
        <InfoTip label="the Project tab" id="project-info-tip">
          <p>
            The whole project: every task, archived ones too. The search and filters don't apply here, as they do on the
            other tabs.
          </p>
        </InfoTip>
      </h2>
      {#if description}<p class="project-description" id="project-description">{description}</p>{/if}
    </div>
  </header>

  <div class="project-columns">
    <section class="project-card" id="project-info" aria-labelledby="project-info-title">
      <h3 class="menu-label" id="project-info-title">Information</h3>
      <dl class="project-facts">
        <dt>Repository</dt>
        <dd id="project-repository">
          {#if repository}
            <a href={repository} target="_blank" rel="noopener noreferrer">{repository.replace(/^https?:\/\//, '')}</a>
          {:else}
            <span class="muted">Not set: <code>atm repository set &lt;url&gt;</code></span>
          {/if}
        </dd>
        <dt>Workflow</dt>
        <dd id="project-workflow">
          {#if workflow}
            <div>{workflow.type}{workflow.base ? ` → ${workflow.base}` : ''}</div>
            <div class="muted">{workflow.verify ? 'Verifies before pushing' : 'Pushes without verifying'}</div>
            {#if workflow.commitTemplate}<div><code>{workflow.commitTemplate}</code></div>{/if}
            {#if workflow.trailers.length}
              <div class="muted">
                Required trailers: {#each workflow.trailers as line (line)}<code>{line}</code>
                {/each}
              </div>
            {/if}
          {:else}
            <span class="muted">Not set: <code>/atm:push</code> asks the first time</span>
          {/if}
        </dd>
        <dt>People</dt>
        <dd id="project-people">
          {#each who.people as p (p.name)}
            <div class="project-person" data-name={p.name}>
              {p.name}
              <span class="muted">created {p.created} · started {p.started} · completed {p.completed}</span>
            </div>
          {:else}
            <span class="muted">None recorded</span>
          {/each}
        </dd>
        <dt>Agents</dt>
        <dd id="project-agents">
          {plural(who.agents.sessions, 'session')} · started {who.agents.started} · completed {who.agents.completed}
          · {who.agents.agentMs ? formatMinutes(who.agents.agentMs / 60_000) : '0 m'} agent time
        </dd>
      </dl>

      <h4 class="menu-label">Vocabulary</h4>
      <dl class="project-facts project-vocab" id="project-vocab">
        <dt>Phases</dt>
        <dd id="project-phases">
          {#each phases as p (p.phase)}
            <span class="vocab-item" data-phase={p.phase} data-state={p.state}
              >{p.state === 'done' ? '✓ ' : ''}{p.name ? `${p.phase} ${p.name}` : `Phase ${p.phase}`}
              <strong>{p.count}</strong></span
            >
          {/each}
          {#if finished.length}
            <button class="link-button" id="project-finished-toggle" onclick={() => (showFinished = !showFinished)}
              >{showFinished ? 'Hide finished' : `▸ ${finished.length} finished`}</button
            >
          {/if}
        </dd>
        <dt>Labels</dt>
        <dd id="project-labels">
          {#each counts.labels as l (l.id)}
            <span class="vocab-item" data-label={l.id} title={l.text === l.id ? undefined : l.id}
              >{l.text} <strong>{l.count}</strong></span
            >
          {:else}
            <span class="muted">None</span>
          {/each}
        </dd>
        <dt>Types</dt>
        <dd id="project-types">
          {#each counts.types as t (t.id)}
            <span class="vocab-item" data-type={t.id}>{t.label} <strong>{t.count}</strong></span>
          {/each}
        </dd>
        <dt>Statuses</dt>
        <dd id="project-statuses">
          {#each counts.statuses as s (s.id)}
            <span class="vocab-item" data-status={s.id}
              >{s.label}{s.kind && s.kind !== s.id ? ` (${s.kind})` : ''} <strong>{s.count}</strong></span
            >
          {/each}
        </dd>
        <dt>Priorities</dt>
        <dd id="project-priorities">
          {#each counts.priorities as p (p.id)}
            <span class="vocab-item" data-priority={p.id}
              >{p.id} {p.label}{p.isDefault ? ' (default)' : ''} <strong>{p.count}</strong></span
            >
          {/each}
        </dd>
      </dl>
    </section>
  </div>
</div>
