**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v24
**Author:** Abhishek Chaurasia · **Created:** 2026-09-16 · **Last updated:** 2026-09-16 by Abhishek Chaurasia

# The access token

Delivers **requirement 15** (v24): a tester pastes the token for the environment the build targets,
and every Billing API request carries it as `Authorization: Bearer …`.

> **Partly superseded 2026-09-16 by
> [the scope box belongs to local](2026-09-16T1600-01-the-scope-box-belongs-to-local.md) (v26),
> after the user ran this against dev and qa.** Two things below are no longer true. **The three id
> fields are not shown on every build** — they are the `local` build's alone, and dev and qa do not
> send them even before a token is pasted, which reverses this plan's "keyed on the token rather than
> on `environment.name`" reasoning: it assumed the ids meant something, and on those builds they were
> invented values nobody could see or set. **And the box's mismatch warning is silent** wherever the
> ids are not what a request carries. Everything about the token itself — runtime entry, per-environment
> storage, blank meaning no header, the URL guard — stands unchanged.

## Today the dev and qa builds cannot reach their APIs at all

This is not a missing convenience. It is a wall.

```
ng serve --configuration qa
        │
        ▼
proxy.conf.qa.json  →  https://api-qa-my.innago.com
        │
        ▼
Gateway  /billing/{everything}
        │   "AuthenticationProviderKey": "Bearer"
        ▼
      REFUSED — Billing is never reached
```

The interceptor sends `OrganizationUid`, `PropertyOwnerUid` and `IdentityId`, and **no
`Authorization` at all**. Its own comment has said since v21 that this is where a bearer would go when
sign-in landed. Sign-in has not landed; the dev and qa builds have been unusable against a real
environment in the meantime, and no scope header can change that, because the refusal happens a hop
before Billing.

## The token is entered at runtime, not compiled in

**This is the part of the request that is answered differently from how it was asked.** Putting the
token in `environment.qa.ts` would satisfy "whichever env build we make" literally, and it is the
wrong shape for two independent reasons — either one sufficient on its own:

| | |
|---|---|
| **A secret in source control** | A bearer token in a committed file is a credential in git history, readable by everyone with the repository and surviving every attempt to delete it |
| **A JWT expires in hours** | The build would be stale before the day was out. Every refresh becomes an edit, a rebuild and a redeploy — to run a test |

The second is the decisive one: even if the secret were acceptable, the thing would not work by
tomorrow morning.

**What answers the request without either cost:** the token lives in the Test scope box and is
remembered **keyed by `environment.name`**. The qa build reads the qa token, the dev build reads the
dev one, both survive a reload, and switching between builds does not mean re-pasting. That is
"whichever env build we make", implemented where a token can actually be refreshed in five seconds.

## Blank is a real value, and this is the opposite of the box's other fields

The three identifiers ignore a blank, because an empty header is a `400` from the backend. **An empty
token means *send no `Authorization` header at all*** — which is exactly right for the local build,
where there is no gateway and Billing registers no authentication scheme of its own.

**The default is empty rather than an invented value**, again unlike the ids. A fabricated token looks
real, is refused at the gateway, and sends whoever is debugging to look for the wrong problem.

**One milestone, four files.** No new dependency, no route change, no proxy change.

---

## Setup & Environment

Angular workspace as-is.

| File | Why |
|---|---|
| `src/app/request-scope.service.ts` | The token signal, its per-environment storage, and a setter that accepts blank |
| `src/app/scope-headers.interceptor.ts` | Attaches `Authorization` when a token is present |
| `src/app/app.component.html` / `.ts` | The field in the Test scope box |
| `src/app/scope-headers.interceptor.spec.ts` | Both arms — attached when set, absent when not |

**Existing code this follows — read it first.**

| What | Where | Why it matters |
|---|---|---|
| The three ids | `RequestScopeService` | The shape to copy: a signal, a readonly accessor, a setter that persists |
| `readStored` | same file | Wrapped in `try`/`catch` because `localStorage` **throws** in a private window with site data blocked. The token must not break the application either |
| Blank handling | `setOrganizationId` | **The pattern NOT to copy.** It ignores a blank; the token must accept one, because blank is how you turn the header off |
| The URL guard | `scopeHeadersInterceptor`'s first line | `request.url.startsWith(environment.apiBaseUrl)` — the token must inherit this, so it never leaks to another host |
| The mismatch warning | `additional-charge-panel.component.html` | The precedent for telling a tester on screen that two sources of truth disagree |

### Prerequisites & Open Questions

- [x] **How to obtain a token: answered 2026-09-16 — the user enters it.** Sign in to the environment
      and copy the bearer from a request's headers, as the screenshot that prompted this work showed.
      **Written into the box's own hint text**, including that it expires, so the next person does not
      have to ask and the one after that does not either.
- [x] **Withdrawn 2026-09-16 rather than answered, and that is the better outcome.** *The user
      decided the two sets are never sent together* (requirement 15f, spec v25): with a token the
      request carries `Authorization` and none of the three ids; without one it carries the ids and
      no `Authorization`.

      **The question cannot arise if the client never sends both.** It was going to be answered by
      an experiment against qa; not creating the condition is worth more than measuring it, because
      the measurement would have had to be repeated every time the gateway config changed.

      Original question, for the record: Ocelot's `AddHeadersToRequest` derives `UserId`,
      `OrganizationId`, `PropertyOwnerId` and more **from the token**, while this application sent
      `OrganizationUid`, `PropertyOwnerUid` and `IdentityId` of its own — and if they collided, the
      backend would record whoever the token said while a tester read the box and believed
      otherwise.

---

## Milestone-Based Implementation

### Milestone 0 — The token is entered, remembered per environment, and sent

**Implements:** requirement 15 a–e.
**Depends on:** nothing.
**Expected outcome:** paste a qa token, reload, and the qa build still has it; every Billing request
carries `Authorization: Bearer …`; the local build with an empty box sends no such header.

#### Tasks

- [x] Write the interceptor specs **first**, both arms:
      `attaches the bearer when a token is set` ·
      `sends no Authorization header when the token is blank` — **the second is the one that matters**,
      because an always-attached header would pass a one-armed test and would send `Bearer ` (with
      nothing after it) from the local build, which reads as a malformed credential rather than none.
- [x] A third spec: `does not attach the token to a URL outside the API base` — the leak case. The
      scope headers already have this guard; the token inherits it, and inheriting silently is worth a
      test of its own because the consequence is a credential sent to a third party.
- [x] `request-scope.service.ts`:
      **the storage key becomes per environment** — `innago.test-scope.<environment.name>` — so a qa
      token and a dev token coexist. **Note what this changes for the existing three ids:** they move
      to the same per-environment key, which is the correct behaviour anyway (a qa account id is not a
      dev one) but does mean **an existing tester's remembered ids are not found on first load after
      this ships** and fall back to fresh generated values. Call that out at the checkpoint rather than
      letting somebody discover it.
- [x] `request-scope.service.ts`: `accessToken` signal defaulting to **empty**, and
      `setAccessToken(value)` that **stores a blank** rather than ignoring it — trimmed, because a
      copied token routinely carries whitespace, and a leading space makes the header malformed in a
      way that reads as a server fault.
- [x] `scope-headers.interceptor.ts`: spread `Authorization` in only when the token is non-empty,
      inside the existing URL guard.
- [x] `app.component.html` / `.ts`: a field in the Test scope box, rendered **only when
      `environment.name` is `dev` or `qa`** (requirement 15a). A **textarea**, not an input — a JWT is
      hundreds of characters and a single-line box makes it impossible to confirm what was pasted.
      Hint text says to copy the bearer from a signed-in session's request headers, because the token
      expires and this will be done repeatedly rather than once.
- [x] Show the environment the box is for (`environment.name`), so a tester on the qa build can see at
      a glance that they are not looking at the dev token.
- [x] `ng build`, `tsc --noEmit` and `ng test` green.
- [x] **STOP — review checkpoint: reported 2026-09-16.** 4 files, 6 specs, the per-environment storage
      change and its one-time effect on remembered ids all reported; commit `984217b`, and `38233dd`
      for requirement 15f, which the user added at the checkpoint.

#### Flow Card — M0 The access token

**Trigger:** any Billing API request from the running application.

| # | Where | What happens |
|---|-------|--------------|
| 1 | Test scope box | Rendered only on the `dev` and `qa` builds (15a). The tester pastes the token for this build's environment |
| 2 | `RequestScopeService` | Stores it under `innago.test-scope.<environment.name>`, so dev and qa do not overwrite each other |
| 3 | `scopeHeadersInterceptor` — URL guard | **Requirement 15e.** Non-Billing URLs pass through untouched; the credential never leaves for another host |
| 4 | same — header assembly | **The business rule lives here — 15d.** `Authorization` is attached **only** when the token is non-empty, so the local build sends none rather than `Bearer ` |
| 5 | Gateway | Validates the token and injects its own caller headers derived from it — which may disagree with the box's three ids |

**Rules covered:** 15a, 15b, 15c, 15d, 15e
**Tests:** `attaches the bearer when a token is set` ·
`sends no Authorization header when the token is blank` ·
`does not attach the token to a URL outside the API base`
**Fails when:** the header is attached unconditionally → the local build sends `Bearer ` and Billing
sees a malformed credential where it expected none · the URL guard is bypassed → **a credential is
sent to whatever host the application calls next** · the storage key is not per environment → pasting
a qa token silently replaces the dev one, and the next dev run fails with a `401` nobody can explain
**Start debugging here:** `scope-headers.interceptor.ts` — every header this application adds is
assembled in one place.

**Reviewer's 10-minute path:** read the interceptor's header block and
`sends no Authorization header when the token is blank`. The conditional spread is the whole rule.

---

## Scope & Context Rules

**May be modified:** the four files in the Setup table.

**Must not be modified:** the proxy configurations — they already point where they should, and the
missing token was the only reason dev and qa were unreachable. The three existing ids' blank-ignoring
setters — the token behaves differently on purpose, and making them alike would break the `400`
protection they exist for.

### Technical Decisions

**TD1 — Runtime, not compiled in.** A token in `environment.*.ts` is a secret in git, and expires
within hours regardless. Either objection alone settles it; together they make the compiled version
both unsafe and useless.

**TD2 — Keyed by `environment.name`.** One shared key would mean pasting a qa token wipes the dev one,
and the next dev run fails with a `401` that looks like a broken environment rather than a
last-Tuesday paste.

**TD3 — Blank stores, blank sends nothing.** Copying the ids' blank-ignoring setter would make the
token impossible to clear, which is the local build's normal state. And attaching `Authorization`
unconditionally would send `Bearer ` — a malformed credential reads worse than an absent one, because
it invites the reader to debug authentication rather than notice there is none.

**TD4a — The field is gated on the build, the header on the value.** Two separate mechanisms doing
two separate jobs, and collapsing them would break one of them. The **field** is hidden on `local`
and `production` because neither should be collecting a pasted credential. The **header** is attached
only when the token is non-empty, which is what keeps a `dev` build with an empty box from sending
`Bearer ` — gating the field alone would not.

**TD4 — A textarea, not an input.** A JWT runs to hundreds of characters. A single-line box makes it
impossible to see whether the paste is complete, and a truncated token fails as a `401` that looks
like an expiry.

---

## Verification

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration qa
```

Then, end to end — the check that actually proves the feature:

```bash
npx ng serve --configuration qa
```

Paste a qa token into the box, create a rent agreement, and confirm a `201` rather than the `401`
that arrives today. Then reload the page and confirm the token survived. Then run
`ng serve --configuration dev` and confirm the box is **empty** rather than holding the qa token —
that is requirement 15b, and it is the one a person can observe failing.

---

## Git & Rollback

| Milestone | Commit | Rollback |
|---|---|---|
| M0 | `feat(scope): send an access token so the dev and qa builds can reach their APIs (requirement 15)` | Revert. The dev and qa builds go back to being refused at the gateway, which is where they are today. **Remembered ids are regenerated once more** on the way back, for the same reason as on the way out |

---

## Final Validation

- [x] `Authorization` is attached only when the token is non-empty, and only to Billing URLs.
- [x] The storage key carries `environment.name`, and a qa token does not appear on a dev build.
- [x] The token field defaults to empty, with no generated value.
- [x] The field is absent on the `local` and `production` builds, and present on `dev` and `qa`.
- [x] The box states which environment it belongs to.
- [ ] A `ng serve --configuration qa` run with a real token reaches a `201`.
- [x] The open question about gateway header precedence is **withdrawn**: requirement 15f means the
      client never sends both sets, so precedence cannot be reached.
