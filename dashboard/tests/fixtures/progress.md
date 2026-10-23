# progress.json: expected numbers

Tests for the Progress tab (forecast, burndown, phase table) use this fixture with a fixed clock:
**now = 2026-04-06T12:00:00Z**.

| Phase | Tasks                                                                       | State       |
| ----- | --------------------------------------------------------------------------- | ----------- |
| 0     | T-001…T-004, all done (last completion 2026-04-01 09:30)                    | Done        |
| 1     | T-005…T-008 done, T-009 in progress, T-010 blocked                          | In progress |
| 2     | T-011…T-015 todo, T-016 skipped (created 2026-04-02 15:00, after the start) | Not started |

## Durations (forecast model, section 3 of docs/dashboard-v2-requirements.md)

| Task  | How                                                             | Minutes |
| ----- | --------------------------------------------------------------- | ------- |
| T-001 | completed_at − started_at                                       | 6       |
| T-002 | completed_at − started_at                                       | 8       |
| T-003 | completed_at − started_at                                       | 10      |
| T-004 | completed_at − started_at                                       | 6       |
| T-005 | completed_at − started_at                                       | 12      |
| T-006 | completed_at − started_at                                       | 8       |
| T-007 | no started_at: gap since the previous completion (T-006, 14:20) | 9       |
| T-008 | no started_at: gap since T-007 is ~19.5 h, capped               | 30      |

Sorted: 6, 6, 8, 8, 9, 10, 12, 30 (8 timed completions, all within the last 10).

- **Pace:** median 8.5 min; range P25–P75 = 7.5–10.5 min (linear interpolation between ranks).

## Remaining work and estimates

Unfinished = todo + in progress; blocked and skipped tasks don't count (T-010 is reported as a warning).

| Phase | Remaining up to this phase | Estimate (likely)     | Range        | If the loop keeps running |
| ----- | -------------------------- | --------------------- | ------------ | ------------------------- |
| 0     | 0                          | done 2026-04-01 09:30 | –            | –                         |
| 1     | 1 (T-009)                  | 8.5 min               | 7.5–10.5 min | 2026-04-06 12:08:30       |
| 2     | 1 + 5 = 6                  | 51 min                | 45–63 min    | 2026-04-06 12:51          |

## Burndown

- Scope (skipped tasks excluded): 10 from 2026-04-01 08:00, 15 from 2026-04-02 15:00.
- Remaining = scope − completed (blocked tasks count as remaining): 10 at the start; 9, 8, 7, 6 as phase 0 finishes
  (09:06–09:30 on 04-01); 5, 4, 3 at 14:12, 14:20, 14:29 on 04-02; 8 when phase 2 is added (15:00); 7 at 10:00 on
  04-03; 7 now.
- Forecast: from 7 now down to 1 (the blocked T-010) at 12:51, range 12:45–13:03.
