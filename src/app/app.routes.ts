import { Routes } from '@angular/router';

/**
 * Every feature route is lazy.
 *
 * It began as an exception — the additional-fee page was deferred because eagerly importing it pushed
 * the initial bundle past `angular.json`'s 800 kB budget — and then the same thing happened with each
 * screen added after it. A mix of eager and lazy routes has no principle behind it beyond the order
 * things were built in, and it makes the budget a lottery: whichever screen happens to be added next
 * pays for all the ones already in the initial chunk. Deferring all of them puts only the shell in
 * that chunk, which is what it is for.
 *
 * The lease form and the fee panel are the heaviest of these by some way — Angular Material, the
 * datepicker, the schedule table — and they are exactly what a first paint does not need.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'rent-agreements/create', pathMatch: 'full' },
  {
    path: 'rent-agreements/create',
    loadComponent: () =>
      import('./rent-agreements/rent-agreement-create.component').then(
        (m) => m.RentAgreementCreateComponent
      )
  },
  {
    path: 'rent-agreements/open',
    loadComponent: () =>
      import('./rent-agreements/open-rent-agreement.component').then(
        (m) => m.OpenRentAgreementComponent
      )
  },
  // Appends one fee to an already-saved lease, charged to a chosen subset of its tenants. Declared
  // above the `:id`-parameterised routes below: `additional-charges` would otherwise be matched as an
  // agreement id by whichever of them came first.
  {
    path: 'rent-agreements/additional-charges',
    loadComponent: () =>
      import('./rent-agreements/add-additional-charge.component').then(
        (m) => m.AddAdditionalChargeComponent
      )
  },
  // Same component as create — it switches to edit mode when the route carries an id, loading the
  // saved agreement instead of starting blank. Both routes resolve to one chunk.
  {
    path: 'rent-agreements/:id/edit',
    loadComponent: () =>
      import('./rent-agreements/rent-agreement-create.component').then(
        (m) => m.RentAgreementCreateComponent
      )
  },
  // Step 2 of the lease wizard, reached after a fresh create or via "Manage Tenants" from edit.
  {
    path: 'rent-agreements/:id/tenants',
    loadComponent: () =>
      import('./rent-agreements/add-tenants.component').then((m) => m.AddTenantsComponent)
  },
  {
    path: 'rent-schedule/preview',
    loadComponent: () =>
      import('./rent-schedule/rent-schedule-preview.component').then(
        (m) => m.RentSchedulePreviewComponent
      )
  },
  // One owner's invoices, filtered and paged. Each row links to the correction page below with
  // `?invoiceId=`, which is what makes that page reachable without knowing an id by heart.
  {
    path: 'invoices',
    loadComponent: () => import('./invoices/invoice-list.component').then((m) => m.InvoiceListComponent)
  },
  // Corrects one invoice: looked up by invoice id, corrected through the proposal behind it.
  {
    path: 'invoices/update',
    loadComponent: () =>
      import('./invoices/update-proposed-invoice.component').then(
        (m) => m.UpdateProposedInvoiceComponent
      )
  }
];
