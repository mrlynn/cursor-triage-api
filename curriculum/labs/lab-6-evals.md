# Lab 6 - Evals (deterministic score + optional judge)

**Time:** 30 minutes · **Prerequisites:** Labs 0 and 2

## Two measurements, one of them optional

**Deterministic** (`evals/lib/score.ts`): four fields against three gold
cases. This is the only score that can gate anything. A failure names a
case id.

**Judge** (`evals/lib/judge.ts`): another Agent run that scores a draft
against a six-item rubric and returns JSON you parse after the fact. Off
by default. Do not put it in CI. The Claude twin already measured that a
small-n judge score swings wildly; an agent-judged agent does not fix that.

## What to do

1. Re-read the three gold cases. Check the **label** before you blame the
   model. The Claude twin's first gold set scored 58% and most failures were
   label bugs.
2. If you have budget:

   ```bash
   npx tsx evals/quick.ts
   npx tsx evals/quick.ts --save
   ```

3. Threshold for `--gate` is 2/3. That is "two of three", not a claim about
   production accuracy. On a three-case set, one flip is 33 points.

4. Optional: import `judgeDraft` in a scratch file and score one `/v1/draft`
   body. If the judge text fails Zod, you get `null`. Same lesson as Lab 2.

## Check

- [ ] CI (`npm test`) does not call Cursor.
- [ ] You would not ship a prompt change based on a one-case delta here.
