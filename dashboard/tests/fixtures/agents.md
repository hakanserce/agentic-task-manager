# agents.json: expected timeline

Tests for the Agents tab use this fixture with a fixed clock: **now = 2026-04-01T12:00:00Z** (the browser runs in UTC).

| Agent           | Tasks (start–end, UTC)                                                              | Done | Median  |
| --------------- | ----------------------------------------------------------------------------------- | ---- | ------- |
| claude:alice001 | T-001 08:00–08:30, T-003 08:40–09:40, T-006 10:00–11:00, T-007 11:30– (in progress) | 3    | 1 h     |
| claude:bob00002 | T-002 08:10–09:00, T-005 09:10–10:30                                                | 2    | 1 h 5 m |
| (Unattributed)  | T-004 09:00–09:20 (no `agent`: started before agents were recorded)                 | 1    | 20 m    |

T-008 is todo and has no bar. The timeline runs from 08:00 to now (12:00); lanes are ordered by last activity
(alice is working now, then bob, Unattributed last).

## Activity (top bar)

Completions per hour: 08:00 → 1 (T-001), 09:00 → 3 (T-002, T-004, T-003), 10:00 → 1 (T-005), 11:00 → 1 (T-006).
Cycle times 20, 30, 50, 60, 60, 80 minutes: median 55 m. 6 of 8 tasks done (75%).

## Agent work and idle time

Work: alice 3 h (30 + 60 + 60 m, plus T-007 running 30 m), bob 2 h 10 m (50 + 80 m), unattributed 20 m: 5 h 30 m
over 4 h of calendar time (138%), or 80 m of working time (8 h per weekday, pro rata: 413%). Average agents busy
5.5 h / 4 h ≈ 1.4. Nobody works from 11:00 (T-006 done) to 11:30 (T-007 starts): idle 30 m.
