# Sunlight: Informed Democracy — project brief

This brief hands the project over from a planning chat to a coding session. Read it first, then look at `prototype/index.html` and `site/content/sunlight-content.json`.

## What Sunlight is

A map of the major crises of our time and how they connect, written for people who do not have the time or journal access to read the research. Each topic holds evidence-rated findings, open debates and full references. Each connection between two topics is itself a sourced claim.

The goal is a public website plus Android and iPhone apps, all from one codebase.

## Editorial rules (these shape the data model and the interface)

1. Follow the evidence. Where the science is settled, say so plainly. No false balance.
2. Show real debates. Where qualified experts disagree, set out each position with its sources, alongside what both sides accept.
3. Every claim carries its sources. Peer-reviewed research and scientific assessments come first. Mark sources that are free to read.
4. Plain language.
5. Values: the equal worth of every person and care for the living world. Values shape which questions get asked, not what the evidence shows.

Evidence ratings, used on every finding and connection:

| Rating | Meaning |
| --- | --- |
| Settled | Many independent lines of evidence agree, and major scientific assessments state it without hedging. Treated as fact. |
| Strong | Well supported by good studies or assessments. Exact numbers or scope may still shift. |
| Emerging | Early or limited evidence. Could change as more research comes in. |
| Contested | Qualified experts disagree, and the disagreement is about evidence. |

## What exists today

- `prototype/index.html`: a working single-file prototype (HTML, CSS and plain JavaScript, no build step). It has the map, the reading panel, a Sources page, a Method page, add/edit forms and backup import/export. It was built to run inside Claude, where it saves to Claude's own storage. Opened anywhere else it starts empty and saves to the browser only; use Method → Import from a backup file to load the content.
- `site/content/sunlight-content.json`: the content as of 13 November 2026: 13 topics, 23 connections, 55 sources. The `format` field still reads `crisis-web`, the project's old name; the prototype's importer expects that value.

Data model (see the JSON for real examples):

- `sources/<id>`: `short`, `authors`, `year`, `title`, `venue`, `url`, `kind` (article, assessment, report, book, data, other), `open` (free to read), `note`.
- `topics/<id>`: `title`, `summary`, `x`, `y` (map position on a 1000 × 620 canvas), `updated`, `claims[]` (`id`, `text`, `strength`, `note`, `sources[]`), `debates[]` (`id`, `question`, `agreed`, `positions[]` with `id`, `label`, `text`, `sources[]`).
- `links/<id>`: `a`, `b` (topic ids), `label`, `text`, `strength`, `sources[]`.

## Decisions already made

- Name: Sunlight: Informed Democracy.
- Who edits: the owner plus invited editors, each with a log-in. The public can read but not edit.
- One codebase for the website, the Android app and the iPhone app.
- The phone apps need features beyond the website so Apple accepts them: offline reading, saved topics and sharing.
- The owner has a GitHub account and no Mac, and has no Apple or Google Play developer account yet.

## Decisions still open (ask the owner; check current pricing and terms before recommending)

- Which hosted database and log-in service to use. It must support public read and editor-only write.
- Where to host the website, and the domain name.
- How to package the web app for the stores. Capacitor is the suggested starting point.
- How to build the iPhone app without a Mac (a cloud build service).

## Stages

1. Website: set up the project, port the prototype, load the content, deploy.
2. Editor log-ins and the invite flow.
3. Android app. A new personal Google Play account must run a closed test with at least 12 testers for 14 days before public release, so recruit testers early.
4. iPhone app.

## Known limits to fix when porting

- The map has no zoom or pan and gets crowded past about 20 topics.
- Topics can only be dragged with a mouse, not by touch.
- There is no search.
- The content is a first draft. Claims were checked against abstracts, official summaries and press releases, not full texts. Each entry needs a review against its full source before public launch. Much of the evidence on polarisation, platforms and income inequality is from the United States only.
- Before launch, check the name is free as a domain and in both app stores, and write a privacy policy.

## Suggested first tasks

1. Create a git repository in this folder and a matching private GitHub repository named `sunlight`.
2. Propose a project structure and the open technical choices above, with costs, and wait for the owner's go-ahead.
3. Port the prototype into that structure, keeping the design and the data model, with the content loading from `site/content/sunlight-content.json` until the database is in place.

## Progress

- Stage 1 port done: `site/` is the public website (`index.html`, `styles.css`, `app.js`), read-only, loading `site/content/sunlight-content.json`. No build step. `prototype/` is kept unchanged for reference.
- The map is organised by area: content key `groups` (planet, power, information), and each topic has a `group`. The map opens on the areas; opening one shows its topics on a ring, with linked topics from other areas in a column on the right. Layout is automatic, so topic `x`/`y` values are no longer used.
- To preview locally, serve the `site/` folder over http (opening `index.html` directly from disk will not load the content).
