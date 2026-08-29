# The scenario: Northwind Outfitters

This repo solves the same problem as
[mrlynn/claude-triage-api](https://github.com/mrlynn/claude-triage-api). Read
that twin's [long-form scenario](https://github.com/mrlynn/claude-triage-api/blob/main/curriculum/scenario.md)
when you want the full company history. This page is the short version so Day 1
can start.

## Why this exists

Northwind Outfitters sells outdoor gear on a lifetime workmanship guarantee.
Support takes about 4,100 tickets a week, more than 11,000 in a peak December
week. Most of those are a late package or a wrong size. A few are not.

One inbound message in the sample queue starts with "probably nothing" and
reports that a child's bottle lining flaked and a doctor asked what the child
had been drinking from. That ticket sat unrouted for three days in the story
the Claude twin tells. Automated triage exists so the injury report does not
wait behind "do you ship to Canada."

## What the service must do

Four HTTP routes, same names as the Claude twin, so a storefront could point at
either backend:

| Route | Job |
|---|---|
| `POST /v1/triage` | Classify category, urgency, sentiment, entities, escalation |
| `POST /v1/resolve` | Look up order + policy, recommend an action, then re-check money in code |
| `POST /v1/draft` | Stream a reply a human reads before sending |
| `POST /v1/estimate` | Say what a run used. Cursor has no pre-call token count. |
| `GET /v1/limits` | Key identity (`Cursor.me`) and documented rate limits |

The domain fixtures in `data/` are copied from the Claude twin: customers,
orders, the policy handbook, and the inbound queue. The product contract
(Zod field names on triage and resolve) is the same. The primitives underneath
are not.

## What is different here

The Claude twin is a Messages API course: one endpoint, flags for structured
outputs, tools, streaming, and prompt cache.

This repo is an Agent SDK course. You create an `Agent`, you `send` a prompt,
you get a `Run`. The run can call tools, edit a workspace, and stream
`SDKMessage` events. There is no chat-completions or Messages API to wrap.
If a lab starts to feel like you are reinventing `messages.create`, stop and
re-read [00-concept-map.md](00-concept-map.md).
