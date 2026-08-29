# Lab 2 - Structured outputs: you own the schema after the fact

**Time:** 30 minutes · **Prerequisites:** Lab 1

## The comparison

Claude's twin does this:

1. `output_config.format = zodOutputFormat(TriageSchema)`
2. `client.messages.parse()`
3. `parsed_output` is typed or null

There is no "please reply with JSON" in that prompt, and no `JSON.parse` in
the happy path.

Cursor does not document a structured-output constraint on `Agent.send()`.
This service:

1. Puts the JSON contract in the prompt (`src/prompts.ts`)
2. Extracts an object from the assistant text (`extractJsonObject`)
3. Runs `TriageSchema.safeParse` (`parseTriageOutput`)
4. Returns 502 `unparseable_output` when that fails

That gap is the lesson. Do not paper over it with a retry loop you pretend
is the API.

## What to do

1. Read `src/schemas.ts` - field names match the Claude twin on purpose.
2. Read `src/lib/parse-output.ts` and `src/lib/json.ts`.
3. Run the unit tests that do not need a key:

   ```bash
   npx tsx --test src/lib/parse-output.test.ts
   ```

   They cover: bare JSON, a markdown fence, prose with no object, a missing
   field, an invented category, confidence `> 1`, and `POST /v1/triage` with
   an empty body (400 before any agent call).

4. Optional live: call `/v1/triage` and confirm `meta.schema_enforcement` is
   `after_the_fact_zod`. If the model wraps the object in a fence, extraction
   still succeeds. If it narrates, you get 502 and a `raw` snippet.

## Check

- [ ] You can explain why a 502 here is a product feature, not a bug.
- [ ] You know which tests prove the schema is enforced in *our* process.
