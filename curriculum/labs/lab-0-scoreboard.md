# Lab 0 - Scoreboard / eval baseline

**Time:** 20 minutes · **Prerequisites:** [setup.md](../setup.md)

## Why this is tiny

The Claude twin scores twelve gold cases because a Messages call is cheap and
fast. A Cursor `Agent.send()` is an agent run: workspace scan, tool loop,
hosted inference. Keep the set small or the room waits on the clock.

This repo ships **three** cases in `evals/dataset.jsonl`:

| id | What it tests |
|---|---|
| `eval-01` | Clean jacket-zipper defect, replacement ask |
| `eval-04` | Child + urgent care. Safety must win. |
| `eval-05` | A compliment. Must not escalate. |

They are the same ids and labels as the Claude twin, so a later side-by-side
is possible. We just did not copy the other nine into the first slice.

`evals/baseline.json` starts empty (`recorded_at: null`). That is honest. You
have not run the agent yet.

## What to do

1. Read the three lines in `evals/dataset.jsonl`. For each, write down the
   category you would assign *before* you call the model.
2. Confirm `eval-04` is safety / urgent / `requires_human: true` in the gold
   file. If a future you "improves" that label, the injury report is what you
   broke.
3. Skim `evals/lib/score.ts`. Four fields, `!==`, nothing else. `sentiment`
   and `summary` are returned and not scored. Defend that choice: a free-text
   summary has no single right string.
4. Do **not** run `npx tsx evals/quick.ts` until after Lab 1 unless the
   instructor wants a live number on the board. The command needs
   `CURSOR_API_KEY` and will spend.

After your first live run (later today or as homework):

```bash
npx tsx evals/quick.ts --save
```

That writes passing case ids, not just a count. A swap (one case fixed, one
broken) is visible. A delta of one case on a three-case set is 33 points.
Treat the ids as the signal.

## Check

- [ ] You can name the four scored fields.
- [ ] You know why the set is three cases, not twelve.
- [ ] You have not invented a baseline number you did not measure.
