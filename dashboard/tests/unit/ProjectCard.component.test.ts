import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectCard from '../../src/components/ProjectCard.svelte';
import type { ProjectEntry, ProjectSummary } from '../../src/lib/load';

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
  it('no phases: no ring row; the overall counts stay', () => {
    const { container } = render(ProjectCard, { project: card([]) });
    expect(container.querySelector('.project-card-rings')).toBeNull();
    expect(container.querySelector('.project-card-counts')).toHaveTextContent('9 / 18 done · 2 skipped 50%');
  });

  it('a summary without recent_phases (an older server) shows no rings', () => {
    const { container } = render(ProjectCard, { project: card(undefined) });
    expect(container.querySelector('.project-card-rings')).toBeNull();
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
