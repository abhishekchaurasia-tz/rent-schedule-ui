**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v26
**Author:** Abhishek Chaurasia · **Created:** 2026-09-16 · **Last updated:** 2026-09-16 by Abhishek Chaurasia

# The scope box belongs to local, and a pasted token re-reads the screen

Delivers **requirement 15g** (v26): three defects the user found on the first real run of v24/v25
against dev and qa. **None of them made a screen fail. All three made a screen lie.**

## What the user saw

```
ng serve --configuration qa
        │
        ▼
Test scope
  OrganizationUid    4f821e4c-…      ← invented, unsettable in any way that reaches the server
  PropertyOwnerUid   f306cca0-…      ← same
  IdentityId         …               ← same
  Access token       [ paste here ]
        │
        │  paste the token
        ▼
      nothing happens
```

Three separate bugs meeting on one screen.

## Bug 1 — a box offering three values the build never sends

v25 keyed the **headers** on the token: with one, the request carries `Authorization` and no ids;
without one, the ids. It left the **fields** on every build. Those two rules do not line up, and the
space between them is the bug.

The ids are only settable in the Test scope box, which exists to point this harness at a real account.
On `dev` and `qa`, before a token has been pasted, this application was sending three GUIDs
`crypto.randomUUID()` invented on first load — **values nobody could see, set or correct**, travelling
as though they identified an account. A field collecting a value the build will never send is worse
than no field at all: it invites a tester to set it and then to trust what they set.

**The rule becomes: the ids need both no token *and* the local build.** 15f is untouched and still
holds on its own — wherever a token goes, the ids do not.

**What this reverses, stated plainly, because v25 argued the other way.** v25 chose to key on the
token rather than the build precisely so that a dev or qa build *before* a token would still send the
ids: *"it still sends the ids, is still refused for the real reason, and the refusal still reads as
no token."* That reasoning depended on the ids meaning something. They do not — they are invented and
unreachable — and the gateway refuses the request before Billing either way, so nothing that could
read them ever sees them. **Sending three fabricated identifiers is not a better failure than sending
none.**

## Bug 2 — pasting the token did nothing to the screen already open

Every screen fetches when it opens. The token is pasted **afterwards** — an empty item list is
precisely what sends a tester to the box in the first place. So the data on screen had been read under
a scope that no longer applied, and nothing told the screen otherwise.

**The only remedy was a browser reload**, and on the Add Lease screen that means retyping the lease.
That is why this is a requirement rather than a note: the remedy was worse than the bug on the one
screen where the bug is most likely.

## Bug 3 — a catalog fetch still gated on an argument that was deleted two versions ago

```ts
private loadLineItems(): void {
  if (!this.propertyOwnerId) {   // ← v22 deleted the parameter this guarded
    return;
  }
  ...
```

v22 moved the line-item catalog's owner from a query parameter onto the `PropertyOwnerUid` header and
removed the argument. The `return` that existed to protect that argument stayed. A record naming no
owner therefore fetched **nothing at all**, and the panel rendered *"No catalog items are available to
pick from yet"* — which reads as an empty catalog rather than a request never made.

**It survived two versions because a test pinned it**: `does not fetch the catalog when
propertyOwnerId is not set` asserted the defect as though it were the rule. That test is deleted here,
and its opposite asserted in its place.

---

## Setup & Environment

Angular workspace as-is. No new dependency, no route change, no proxy change.

| File | Why |
|---|---|
| `src/app/scope-headers.interceptor.ts` | `sendsScopeIds(environmentName, token)` — the rule, extracted so it can be tested for all four builds |
| `src/app/request-scope.service.ts` | The `revision` signal every open screen watches |
| `src/app/scope-change.ts` | **New.** `reloadOnScopeChange(reload)` — one effect, and the reason its first run is dropped |
| `src/app/app.component.ts` / `.html` | The three id fields become `local`-only |
| `src/app/rent-agreements/additional-charge-panel.component.ts` | The deleted guard, the catalog refetch, the silenced mismatch notice |
| `src/app/rent-agreements/rent-agreement-create.component.ts` | Candidate dates and the auto-preview, re-run on a scope change |
| `src/app/invoices/update-proposed-invoice.component.ts` | The item catalog, re-read — **and deliberately not the invoice** |
| `src/app/invoices/invoice-list.component.ts` | The search, re-run once one has been run |

**Existing code this follows — read it first.**

| What | Where | Why it matters |
|---|---|---|
| The header assembly | `scopeHeadersInterceptor` | Every header this application adds is decided in one place; that has not changed |
| `persist()` | `RequestScopeService` | The one thing all four setters call, **and which a blank-ignoring setter returns before reaching** — which is why the change announcement lives there and not in each setter |
| `onActivated()` | `rent-agreement-create.component.ts` | The precedent for refetching **part** of a screen: it reads the status back and deliberately not the form |
| `maybeAutoGeneratePreview()` | same file | Its signature guard is what makes re-running it safe — an existing schedule is left alone |

### Prerequisites & Open Questions

- [x] **Does a dev or qa build with no token send the ids? Answered 2026-09-16 — no, and this reverses
      v25.** See Bug 1. The user's report settles it: a field that cannot reach the server should not
      be on screen, and a value that cannot be set should not be sent.
- [x] **What does a screen re-read on a scope change? Answered by the screens themselves:** whatever
      it fetched without being asked. Nothing that would discard typing.

---

## Milestone-Based Implementation

### Milestone 0 — The ids belong to the local build

**Implements:** requirement 15g1, 15g4.
**Depends on:** nothing.
**Expected outcome:** the qa build's Test scope box holds the token and nothing else; its requests
carry `Authorization` or no caller headers at all, never an invented GUID.

#### Tasks

- [x] `sendsScopeIds(environmentName, token)` in the interceptor, **exported and taking both values as
      arguments rather than reading `environment` itself**. This is the part worth copying: the specs
      run under `environment.ts`, which is the **local** build, so no test in this repository could
      ever have observed what a `dev` or `qa` build sends — *which is exactly where the wrong thing was
      being sent*. A condition buried in the interceptor is untestable for three of the four builds.
- [x] Three specs against the function directly: dev/qa/production send no ids even with no token;
      local does; a token suppresses them everywhere, including local (15f, unchanged).
- [x] `app.component.ts` / `.html`: `showScopeIds = environment.name === 'local'`, gating the three
      fields and their hint. Written as its own condition rather than `!showAccessToken`, because
      `production` has to fall outside **both**.
- [x] `additional-charge-panel`: the mismatch notice returns `false` unless `sendsScopeIds` is true —
      otherwise it fires on every dev and qa record, against a GUID nobody ever saw.
- [x] `ng build --configuration qa`, `tsc --noEmit`, `ng test` green.

### Milestone 1 — A pasted token re-reads the screen

**Implements:** requirement 15g2, 15g3.
**Depends on:** nothing (independent of M0, shipped together).
**Expected outcome:** open the fee panel on Add Lease, see an empty item list, paste the token, watch
the list fill — with the lease still typed in behind it.

#### Tasks

- [x] `RequestScopeService.revision`, bumped inside `persist()`. **In `persist` rather than in each
      setter**, because a blank-ignoring setter returns before reaching it — so a keystroke that
      changed nothing does not make every open screen refetch. One spec each way.
- [x] `scope-change.ts`: `reloadOnScopeChange(reload)`, **dropping the effect's first execution**. That
      run happens on the change-detection pass that also runs `ngOnInit`, which is already fetching —
      and it happens before a component's `@Input()`s have decided *what* to fetch, so the fee panel
      would ask for the ordinary catalog on a deposit-only panel.
- [x] **Comparing revisions was tried first and is subtly wrong**, which is recorded in the file rather
      than rediscovered: a scope change between construction and first change detection leaves the
      captured revision already stale, and the effect fires on that same first pass — fetching twice
      after all, in the one ordering that is hardest to reproduce. Three existing panel specs caught
      it.
- [x] The four screens wired, each re-running only what is safe to repeat. **The invoice correction
      screen re-reads its catalog and not the invoice**: `load()` calls `resetLoadedState()` and would
      throw away corrections already typed.
- [x] `additional-charge-panel`: delete the `!this.propertyOwnerId` guard, delete the test that pinned
      it, assert the opposite.
- [x] A spec for the sequence itself: panel open, empty catalog flushed, token pasted, refetch.
- [x] `localStorage.clear()` in the panel spec's hooks — `RequestScopeService` seeds from storage,
      which outlives the TestBed, and **Jasmine runs specs in a random order**, so a token stored by a
      new test reached the older mismatch tests and silenced them. A failure that appears and
      disappears with the seed is worth one line to prevent.
- [x] **STOP — review checkpoint: reported 2026-09-16.**

#### Flow Card — M0/M1 The scope box on each build

**Trigger:** any Billing API request, and any edit to the Test scope box.

| # | Where | What happens |
|---|-------|--------------|
| 1 | Test scope box | `local` shows the three ids; `dev` and `qa` show the token; `production` shows neither |
| 2 | `RequestScopeService.persist` | Stores the four values **and bumps `revision`** — skipped entirely when a blank-ignoring setter returned early |
| 3 | `reloadOnScopeChange` | Each open screen re-runs its own safe fetch. **First execution dropped**, or every screen fetches twice on open |
| 4 | `scopeHeadersInterceptor` — URL guard | Non-Billing URLs pass through untouched (15e) |
| 5 | `sendsScopeIds(environment.name, token)` | **The rule — 15f and 15g1.** Ids only when there is no token **and** the build is `local`; otherwise the bearer, or nothing |

**Rules covered:** 15f, 15g1, 15g2, 15g3, 15g4
**Tests:** `Req15g_DevAndQaBuilds_NeverSendTheScopeIdsEvenWithNoTokenYet` ·
`Req15g_LocalBuild_SendsTheScopeIdsWhenThereIsNoToken` ·
`Req15f_ATokenSuppressesTheIdsOnEveryBuildIncludingLocal` ·
`Req15g_PastingAToken_AnnouncesTheChangeOnRevision` ·
`Req15g_IgnoredBlankId_DoesNotAnnounceAChange` ·
`Req15g_NoRecordOwner_StillFetchesTheCatalog` ·
`Req15g_TokenPastedWhilePanelIsOpen_RefetchesTheCatalogWithoutAReload` ·
`Req15g_TokenInPlay_SilencesTheOwnerMismatchNotice`
**Fails when:** the rule goes back inside the interceptor → **three of the four builds become
untestable, which is how this shipped in the first place** · the effect's first run is not dropped →
every screen fetches twice on open, and the fee panel fetches the wrong catalog scope · a screen
re-runs its full load instead of its catalog → a token pasted mid-edit discards the edit
**Start debugging here:** `sendsScopeIds` — one function, one line, and it decides every caller header
this application sends.

**Reviewer's 10-minute path:** read `sendsScopeIds` and the three specs that ask it about each build.
Then read the comment in `scope-change.ts` about why the first run is dropped.

---

## Scope & Context Rules

**May be modified:** the eight files in the Setup table.

**Must not be modified:** requirement 15f's rule — a token still suppresses the ids everywhere,
including local, and g1 narrows the *other* arm only. The proxy configurations. The blank-ignoring
setters on the three ids, which is what keeps `revision` from firing on a keystroke that changed
nothing.

### Technical Decisions

**TD1 — The rule is a pure function taking the environment name.** Not a tidiness preference. The
specs run under `environment.ts` — the local build — so a condition reading `environment` directly can
only ever be observed for one of the four builds, and the other three are where the defect was. This
is the single change that would have caught the original bug.

**TD2 — Both conditions, not one.** `local` **and** no token. Keying on the build alone would send the
ids alongside a token on local and break 15f; keying on the token alone is what shipped.

**TD3 — `revision` is a counter, not four watched values.** A screen does not care *which* of the four
changed; it cares that what it is showing was read as somebody else. One signal means one effect per
screen, and a paste that changes two values fires it once.

**TD4 — The effect's first execution is dropped, not diffed.** See M1. Skipping the first run is
correct for every ordering; comparing against a revision captured at construction is correct only when
nothing changes in the gap, and that gap is exactly where the existing specs put a change.

**TD5 — Each screen re-runs its fetch, not its load.** A catalog, a list, a candidate-date
enumeration. Never a form re-hydration — the whole point is that a browser reload was the unacceptable
remedy, and a re-hydration is a browser reload confined to one screen.

---

## Verification

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration qa
```

Then, end to end — the checks that prove the three bugs are gone:

```bash
npx ng serve --configuration qa
```

1. The Test scope box holds **the token and nothing else**. No OrganizationUid, no PropertyOwnerUid,
   no IdentityId.
2. With the box empty, open Add Lease and the fee panel: the request carries **no** `OrganizationUid`
   and **no** `Authorization`, and is refused at the gateway.
3. Leave the panel open. Paste the token. **The item list fills without a reload**, and the lease typed
   in behind it is still there.
4. `npx ng serve` (local) still shows the three ids and sends them.

---

## Git & Rollback

| Milestone | Commit | Rollback |
|---|---|---|
| M0/M1 | `fix(scope): the ids belong to the local build, and a pasted token re-reads the screen (requirement 15g)` | Revert. The qa box offers three unsendable fields again and a pasted token needs a browser reload |

---

## Final Validation

- [x] `sendsScopeIds` returns false for `dev`, `qa` and `production` regardless of the token.
- [x] `sendsScopeIds` returns false for `local` once a token is set — 15f, unchanged.
- [x] The three id fields render on `local` only; the token field on `dev` and `qa` only.
- [x] `persist()` bumps `revision`; an ignored blank does not.
- [x] The fee panel fetches its catalog with no record owner.
- [x] A token pasted while the panel is open refetches the catalog.
- [x] No screen re-hydrates a form on a scope change.
- [x] `tsc --noEmit`, `ng test` (359 specs) and `ng build --configuration qa` all green.
- [ ] A `ng serve --configuration qa` run with a real token reaches a `201` — **still open, carried
      from v24**: it needs a real token and a real environment, which only the user has.
