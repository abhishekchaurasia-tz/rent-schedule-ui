# Rent Schedule UI

An Angular UI for the `POST /rent-schedule/preview` endpoint of the
[Innago.RentAccounting](../innago-rent-accounting) API — a pure, stateless rent schedule generator.

Generated with [Angular CLI](https://github.com/angular/angular-cli) v19.

## What this app does

A single-page form (`src/app/rent-schedule/`) lets you:

- Enter lease parameters: dates, rent, lease term type (fixed / month-to-month), and one of six
  payment frequencies (Monthly, Bi-Monthly, Weekly, Bi-Weekly, Semi-Annual, Custom), with the
  frequency-specific configuration fields shown/hidden dynamically.
- Optionally attach manually-adjusted row overrides.
- Submit to the API and see the generated schedule (rows, total invoices, total amount), or
  validation errors if the input was invalid — the API always returns `200 OK`; check
  `validationErrors` to know whether the schedule is real.

## Running against the API

1. Start the .NET API (from the `innago-rent-accounting` repo):

   ```bash
   dotnet run --project src/Innago.Billing.Api
   ```

   By default it listens on `http://localhost:5169` (see `Properties/launchSettings.json`).

2. Update `src/environments/environment.ts` if your API runs on a different port.

3. Start this app:

   ```bash
   npm install
   npm start
   ```

   Open `http://localhost:4200`.

CORS for `http://localhost:4200` is already allowlisted in the API's `appsettings.json`
(`Cors:AllowedOrigins`). There is no `appsettings.Development.json` any more — the API ships a single
settings file, and those origins are read **only** when it runs in the Development environment, so a
deployed API grants none however that file is written.

## Running against dev or qa

The section above runs against a **local** API. To drive a real environment instead, pick the build
configuration for it — the difference is which API the dev-server proxies to, and whether a token is
needed.

| Configuration | API it reaches | Access token |
|---|---|---|
| *(none)* / `development` | `http://localhost:5169` — your own API | Not used |
| `dev` | `https://api-dev-my.innago.com` via the gateway | **Required** |
| `qa` | `https://api-qa-my.innago.com` via the gateway | **Required** |
| `production` | `/api`, same origin | Real sign-in; the box is not offered |

### Why dev and qa need a token

Both go through the API gateway, whose `/billing/{everything}` route validates a bearer before it
forwards anything. Without one **every request is refused at the gateway** and the Billing API is
never reached — so the failure is a `401` that has nothing to do with this application or with the
scope ids in the Test scope box.

### Steps

1. Start the app on the configuration you want:

   ```bash
   npm start -- --configuration qa     # or: ng serve --configuration qa
   ```

2. Sign in to that environment in another tab, open DevTools → **Network**, pick any request, and
   copy the value of its `Authorization` header.

3. In this app's sidebar, under **Test scope**, paste it into **Access token** — **without** the word
   `Bearer`, which the app adds itself.

It is remembered in this browser **per environment**, so the dev and qa builds keep separate tokens
and switching between them does not mean pasting again. **It expires**, so expect to repeat steps 2
and 3; a `401` after a while working is almost always that rather than anything you changed.

### The token replaces the three scope ids, it does not join them

With a token set, the request carries `Authorization` and **none** of `OrganizationUid`,
`PropertyOwnerUid` or `IdentityId`. The gateway derives the caller from the token itself, so sending
ours as well would put two answers to one question in one request — and the client could not know
which the backend would record.

**So on dev and qa the three id boxes have no effect.** They are read on the local build, where
there is no gateway to derive anything and the Billing API reads them directly. Clearing the token
puts them back in use.

### Builds

```bash
ng build --configuration dev
ng build --configuration qa
```

**No token is ever compiled in.** It is entered at runtime because a bearer in a committed file is a
credential in git history, and a JWT expires within hours — a build carrying one would be stale
before the day was out.

Specified in `docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`, requirement 15.

## Project structure

```
src/app/rent-schedule/
├── rent-schedule.models.ts              # TypeScript types matching the API contract
├── rent-schedule.service.ts             # HttpClient wrapper for POST /rent-schedule/preview
├── rent-schedule-preview.component.ts   # Reactive form + submit/result handling
├── rent-schedule-preview.component.html
└── rent-schedule-preview.component.scss
```

## Development server

```bash
ng serve                          # local API on :5169
ng serve --configuration dev      # dev, via the gateway — needs a token
ng serve --configuration qa       # qa, via the gateway — needs a token
```

See *Running against dev or qa* above for the token.

## Building

```bash
ng build
```

## Running unit tests

```bash
ng test
```
