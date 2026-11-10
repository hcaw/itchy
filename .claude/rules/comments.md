# Comments

A comment in this repo states a fact. It never argues for one.

## A comment may state

- An external fact the code cannot show on its own: a library's behaviour (usually openDAW's), a
  browser or language quirk, a spec detail, a fact of music. Example: "openDAW's SoundfontService
  fetches a remote catalogue as soon as it is constructed."
- A trap where the obvious simplification breaks something, stated as the trap itself, not as a
  defence of the line that avoids it. Example: "A song set up inside `editing.modify` is an undo step
  of its own, so the first undo removes the critter" — not "Never set up the song inside
  `editing.modify`."
- In a doc comment on an export, what its name and types can't say: units ("a position in pulses"),
  ranges ("0 to 1"), and what calling it does to the song ("one undo step", "not undoable").

That's the whole list. If a sentence doesn't fit one of these three, it doesn't belong. The reason
after `--` in a lint directive (`oxlint-disable-next-line rule -- reason`) is a comment too, and
follows the same rules.

## A comment must not

- Cite a document, a GitHub issue or a PR as the reason something is true. If the fact matters,
  state the fact; the citation rots and the fact should not depend on it.
- Record why one option was chosen over another, what was rejected, or what used to be there.
  Decisions belong in `docs/DECISIONS.md`, with their reason, not in the code they produced.
- Oblige another file to stay in step ("the two must agree", "kept in step with", "mirrors X's
  semantics"). If the coupling is real, assert it in a test. If nothing enforces it, the comment
  is the only thing holding it together — which means nothing is.
- Point at another file, including a bare "see X". A pointer rots the moment X moves, is renamed,
  or is trimmed to something that no longer discusses the topic.
- Instruct the reader what they may or may not do, when there's no fact behind the instruction.
  "Keep this hook small" and "revisit once there are several critters" tell a future agent what to
  do; they don't tell it anything about the system.
- Speculate about future work ("the next slice replaces this", "reconsider when X lands"). Planned
  work belongs in `docs/ROADMAP.md`.
- Restate what the code plainly says, or name what the file obviously is. If deleting the comment
  loses nothing a reader couldn't get from the code in the same glance, delete it.

## Facts wearing imperative grammar

A comment can look like a directive and still be a fact — the difference is whether the sentence
survives having its verb made indicative. Rewrite it declarative rather than deleting it:

```
- Keep the song's setup out of `editing.modify`: inside it, setting up is an
  undo step, and the first undo removes the critter.
+ A song set up inside `editing.modify` is an undo step of its own, so the
  first undo removes the critter.
```

"Keep this hook small" leaves nothing behind once you drop the imperative. "Keep the song's setup
out of `editing.modify`" leaves a fact about openDAW's undo history. Delete the first kind; rewrite
the second.

## Prefer a test over a comment

When a fact explains why a guard exists, the strongest place for it is a test name or an assertion
message, not a comment — the fact then fails a test when it stops being true, rather than sitting
in a file nobody reads before deleting the guard it protects.

```
test("undo after a new song leaves its critter, because setting up a song is not an undo step", async ({ page }) => { ... })
```

Reach for this whenever the comment you're about to write sits directly above the code it explains
and nothing else in the file already covers it.

## Before stating a fact about openDAW, check it

openDAW's API changes often while it is at 0.0.x. Check a fact against its source in
`node_modules/@opendaw/` before writing a sentence that depends on it — a comment about a behaviour
that changed, or never worked the way the sentence claims, is worse than no comment at all, because
it reads as verified when it isn't.
