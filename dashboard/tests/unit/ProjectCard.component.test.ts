import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectCard from '../../src/components/ProjectCard.svelte';
import type { ProjectEntry, ProjectSummary } from '../../src/lib/load';
import { dashboard } from '../../src/lib/state.svelte';

type RecentPhase = ProjectSummary['recent_phases'][number];

const phase = (id: number, done: number, total: number, name: string | null = null): RecentPhase => ({
  id,
  name,
  done,
  total,
  percent: Math.round((100 * done) / total),
});

const card = (recent_phases: RecentPhase[] | undefined): ProjectEntry => ({
  id: 'p1',
  name: 'Project',
  path: '/work/p1',
  missing: false,
  summary: {
    total: 20,
    done: 9,
    skipped: 2,
    percent: 50,
    current_phase: null,
    agents_working: 0,
    needs_you: { review: 0, blocked_on_user: 0 },
    last_activity: null,
    completions_14d: [],
    ...(recent_phases ? { recent_phases } : {}),
  } as ProjectSummary,
});

const rings = (container: HTMLElement) => [...container.querySelectorAll('.project-card-ring')];

describe('ProjectCard: rings for the recent phases', () => {
  it('no phases: the row keeps its place, saying so; the whole count is in its tooltip, not a line', () => {
    const { container } = render(ProjectCard, { project: card([]) });
    expect(container.querySelector('.project-card-rings')).toBeNull();
    expect(container.querySelector('.project-card-progress')).toHaveTextContent('No tasks yet');
    expect(container.querySelector('.project-card-progress')).toHaveAttribute('title', '9 / 18 done · 2 skipped (50%)');
    expect(container.querySelector('.project-card-counts')).toBeNull();
    expect(container.querySelector('.project-card-phase')).toBeNull();
  });

  it('a summary without recent_phases (an older server): no rings, the count and current phase lines of before', () => {
    const { container } = render(ProjectCard, { project: card(undefined) });
    expect(container.querySelector('.project-card-rings')).toBeNull();
    expect(container.querySelector('.project-card-counts')).toHaveTextContent('9 / 18 done · 2 skipped 50%');
    expect(container.querySelector('.project-card-phase')).toHaveTextContent('Every phase is finished');
  });

  it('one phase: its percentage inside, its number under it, the name and counts in the title and label', () => {
    const { container } = render(ProjectCard, { project: card([phase(16, 4, 13, 'Dashboard polish')]) });
    const [ring] = rings(container);
    expect(rings(container)).toHaveLength(1);
    expect(ring.querySelector('.ring-value')).toHaveTextContent('31%');
    expect(ring.querySelector('.project-card-ring-label')).toHaveTextContent('Phase 16');
    expect(ring).toHaveAttribute('title', 'Phase 16 · Dashboard polish: 4 / 13 done');
    expect(ring.querySelector('svg')).toHaveAttribute('aria-label', 'Phase 16 · Dashboard polish: 4 of 13 done');
  });

  it('four phases, in the order given; a phase without a name is labelled by its number', () => {
    const { container } = render(ProjectCard, {
      project: card([phase(14, 12, 12), phase(15, 17, 17, 'Overview'), phase(16, 4, 13), phase(17, 0, 9)]),
    });
    expect(rings(container).map((r) => r.querySelector('.project-card-ring-label')?.textContent)).toEqual([
      'Phase 14',
      'Phase 15',
      'Phase 16',
      'Phase 17',
    ]);
    expect(rings(container).map((r) => r.querySelector('.ring-value')?.textContent)).toEqual([
      '100%',
      '100%',
      '31%',
      '0%',
    ]);
    expect(rings(container)[2].querySelector('svg')).toHaveAttribute('aria-label', 'Phase 16: 4 of 13 done');
  });
});

describe('ProjectCard: a project with sprints (SR-7.7)', () => {
  const sprint = (id: string, state: 'planned' | 'active' | 'closed', done: number, total: number) => ({
    id,
    state,
    due: null,
    release: null,
    done,
    total,
    percent: Math.round((100 * done) / total),
  });
  const withSprints = (summary: Partial<ProjectSummary>): ProjectEntry => {
    const base = card([]);
    return { ...base, summary: { ...base.summary!, ...summary } };
  };

  it('rings for the recent sprints instead of phases, and the active sprint with its progress and due date', () => {
    dashboard.loadedAt = new Date('2026-04-09T12:00:00').getTime();
    const { container } = render(ProjectCard, {
      project: withSprints({
        recent_sprints: [sprint('Foundations', 'closed', 4, 4), sprint('Ada Lovelace', 'active', 1, 3)],
        active_sprint: { ...sprint('Ada Lovelace', 'active', 1, 3), due: '2026-04-12', goal: 'Sign-in' },
      }),
    });
    expect(rings(container).map((r) => r.querySelector('.project-card-ring-label')?.textContent)).toEqual([
      'Foundations',
      'Ada Lovelace',
    ]);
    const line = container.querySelector('.project-card-sprint')!;
    expect(line).toHaveTextContent('Ada Lovelace — 1 / 3 · due in 3 days');
    expect(line).toHaveAttribute('title', 'Sign-in');
  });

  it('no active sprint says so', () => {
    const { container } = render(ProjectCard, {
      project: withSprints({ recent_sprints: [sprint('Next', 'planned', 0, 2)], active_sprint: null }),
    });
    expect(container.querySelector('.project-card-sprint')).toHaveTextContent('No active sprint');
  });
});

describe('ProjectCard: working now, or next up, by task name (T-207)', () => {
  const withWork = (fields: Partial<ProjectSummary>): ProjectEntry => {
    const project = card([]);
    return { ...project, summary: { ...project.summary!, ...fields } };
  };
  const claim = (task: string, name: string) => ({ task, name, agent: 'claude:e5ea9db0', branch: 'dev/x' });
  const lines = (container: HTMLElement) =>
    [...container.querySelectorAll('.project-card-work-line')].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());

  it("the agents' tasks: ID and name, the agent and branch in the title; no agent count", () => {
    const { container } = render(ProjectCard, {
      project: withWork({ agents_working: 1, working: [claim('T-188', 'One title bar')], next: [] }),
    });
    expect(lines(container)).toEqual(['T-188 One title bar']);
    expect(container.querySelector('.project-card-work-line')).toHaveAttribute(
      'title',
      'T-188 One title bar — claude:e5ea9db0 · dev/x',
    );
    expect(container.querySelector('.project-card-agents')).toBeNull();
  });

  it('more than two: two lines, the second ending in "+N more"', () => {
    const working = [claim('T-1', 'One'), claim('T-2', 'Two'), claim('T-3', 'Three'), claim('T-4', 'Four')];
    const { container } = render(ProjectCard, { project: withWork({ agents_working: 4, working, next: [] }) });
    expect(lines(container)).toEqual(['T-1 One', 'T-2 Two +2 more']);
  });

  it('nobody at work: what the loop takes next', () => {
    const next = [
      { id: 'T-7', name: 'Seven' },
      { id: 'T-8', name: 'Eight' },
    ];
    const { container } = render(ProjectCard, { project: withWork({ working: [], next }) });
    expect(lines(container)).toEqual(['Next: T-7 Seven', 'Next: T-8 Eight']);
    expect(container.querySelector('.project-card-work')).toHaveAttribute('aria-label', 'Next up');
  });

  it('nothing at work or next: the section keeps its place, empty', () => {
    const { container } = render(ProjectCard, { project: withWork({ working: [], next: [] }) });
    expect(container.querySelector('.project-card-work')).not.toBeNull();
    expect(lines(container)).toEqual([]);
  });

  it('an older server (no working list): the agent count, as before', () => {
    const { container } = render(ProjectCard, { project: withWork({ agents_working: 2 }) });
    expect(container.querySelector('.project-card-work')).toBeNull();
    expect(container.querySelector('.project-card-agents')).toHaveTextContent('2 agents working');
  });
});

describe('ProjectCard: the git line and the task finished last (T-208)', () => {
  const withFields = (fields: Partial<ProjectSummary>): ProjectEntry => {
    const project = card([]);
    return { ...project, summary: { ...project.summary!, ...fields } };
  };
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('the branch and the latest PR, linked, with its state', () => {
    const url = 'https://github.com/acme/demo/pull/12';
    const { container } = render(ProjectCard, {
      project: withFields({ git: { branch: 'dev/phase-17', pr: { number: 12, url, state: 'open' } } }),
    });
    expect(text(container.querySelector('.project-card-git'))).toBe('dev/phase-17 · PR #12 open');
    expect(container.querySelector('a.project-card-pr')).toHaveAttribute('href', url);
    expect(container.querySelector('.project-card-pr-state')).toHaveClass('open');
  });

  it('a PR address that is not http(s) is never a link (T-225)', () => {
    const { container } = render(ProjectCard, {
      project: withFields({ git: { branch: null, pr: { number: 4, url: 'javascript:alert(1)', state: 'open' } } }),
    });
    expect(container.querySelector('a.project-card-pr')).toBeNull();
    expect(container.querySelector('[href^="javascript"]')).toBeNull();
    expect(text(container.querySelector('.project-card-git'))).toBe('PR #4 open');
  });

  it('a merged PR without a recorded address: plain text; neither branch nor PR: an empty row in its place', () => {
    const merged = render(ProjectCard, {
      project: withFields({ git: { branch: null, pr: { number: 3, url: null, state: 'merged' } } }),
    });
    expect(text(merged.container.querySelector('.project-card-git'))).toBe('PR #3 merged');
    expect(merged.container.querySelector('a.project-card-pr')).toBeNull();
    const none = render(ProjectCard, { project: withFields({ git: { branch: null, pr: null } }) });
    expect(text(none.container.querySelector('.project-card-git'))).toBe('');
    expect(none.container.querySelector('.project-card-git .icon')).toBeNull();
    // An older server (no git field): no row at all
    const older = render(ProjectCard, { project: card([]) });
    expect(older.container.querySelector('.project-card-git')).toBeNull();
  });

  it('the task finished last replaces the bare time of the last activity', () => {
    const { container } = render(ProjectCard, {
      project: withFields({
        last_activity: '2020-01-01T00:00:00Z',
        last_done: { id: 'T-189', name: 'Status bar', completed_at: '2020-01-01T00:00:00Z' },
      }),
    });
    expect(text(container.querySelector('.project-card-last'))).toMatch(/^T-189 Status bar · .+ ago$/);
  });

  it('nothing finished yet (or an older server): the last activity, as before', () => {
    const { container } = render(ProjectCard, { project: withFields({ last_done: null }) });
    expect(text(container.querySelector('.project-card-last'))).toBe('No activity yet');
  });
});
