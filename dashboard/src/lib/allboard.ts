// The All projects board (docs/all-projects-kanban-proposal.md §3, §4): every project's board summary (api/projects)
// merged into five columns, each sorted by its own rule and cut at one cap, with "+ N more" per project for the rest.
import type { BoardCard, BoardColumnId, ProjectEntry } from './load';

/** Cards per column, as the server caps each project's columns */
export const BOARD_CAP = 30;

export interface AllBoardCard {
  project: ProjectEntry;
  card: BoardCard;
}

export interface AllBoardColumn {
  id: BoardColumnId;
  label: string;
  cards: AllBoardCard[];
  /** Cards left out (by a project's own cap or the column's), per project, in project order */
  more: { project: ProjectEntry; count: number }[];
  /** What an empty column says */
  empty: string;
}

export const BOARD_COLUMNS: { id: BoardColumnId; label: string; empty: string }[] = [
  { id: 'todo', label: 'To Do · ready', empty: 'Nothing ready to start' },
  { id: 'active', label: 'In progress', empty: 'Nothing in progress' },
  { id: 'review', label: 'In review', empty: 'Nothing waiting for a review' },
  { id: 'blocked', label: 'Blocked', empty: 'Nothing blocked' },
  { id: 'done', label: 'Done · last 24 h', empty: 'Nothing finished in the last 24 hours' },
];

// A time for sorting, oldest first or newest first; an unknown time sorts last either way
const time = (iso: string | null | undefined) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? Infinity : t;
};
const recent = (iso: string | null | undefined) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? -Infinity : t;
};

/** The column's cards from every project, in its order (§4): To Do by project (most recently active first) then the
 * loop's order; in progress longest running first; review longest waiting first; blocked on you first, then longest
 * waiting; done most recent first. */
function sortCards(id: BoardColumnId, cards: AllBoardCard[]): AllBoardCard[] {
  const sorted = [...cards];
  switch (id) {
    case 'todo':
      // Stable: within a project, the server's (the loop's) order stays
      return sorted.sort(
        (a, b) => recent(b.project.summary?.last_activity) - recent(a.project.summary?.last_activity) || 0,
      );
    case 'active':
    case 'review':
      return sorted.sort((a, b) => time(a.card.since) - time(b.card.since) || 0);
    case 'blocked':
      return sorted.sort(
        (a, b) =>
          Number(a.card.waiting_on !== 'user') - Number(b.card.waiting_on !== 'user') ||
          time(a.card.since) - time(b.card.since) ||
          0,
      );
    case 'done':
      return sorted.sort((a, b) => recent(b.card.completed_at) - recent(a.card.completed_at) || 0);
  }
}

/** The board of `projects` (those the page shows): projects without a board summary (a missing one, an older
 * server) add nothing. */
export function allBoard(projects: readonly ProjectEntry[], cap = BOARD_CAP): AllBoardColumn[] {
  const withBoard = projects.filter((p) => !p.missing && p.summary?.board);
  return BOARD_COLUMNS.map(({ id, label, empty }) => {
    const all = sortCards(
      id,
      withBoard.flatMap((project) => project.summary!.board![id].cards.map((card) => ({ project, card }))),
    );
    const cards = all.slice(0, cap);
    const more = withBoard
      .map((project) => ({
        project,
        count: project.summary!.board![id].count - cards.filter((c) => c.project === project).length,
      }))
      .filter((m) => m.count > 0);
    return { id, label, cards, more, empty };
  });
}
