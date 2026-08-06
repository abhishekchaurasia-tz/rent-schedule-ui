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
   dotnet run --project src/Innago.RentAccounting.Api
   ```

   By default it listens on `http://localhost:5169` (see `Properties/launchSettings.json`).

2. Update `src/environments/environment.ts` if your API runs on a different port.

3. Start this app:

   ```bash
   npm install
   npm start
   ```

   Open `http://localhost:4200`.

CORS for `http://localhost:4200` is already allowlisted in the API's
`appsettings.Development.json` (`Cors:AllowedOrigins`).

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
ng serve
```

## Building

```bash
ng build
```

## Running unit tests

```bash
ng test
```
