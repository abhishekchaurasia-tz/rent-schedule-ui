import { Routes } from '@angular/router';

import { RentSchedulePreviewComponent } from './rent-schedule/rent-schedule-preview.component';
import { RentAgreementCreateComponent } from './rent-agreements/rent-agreement-create.component';
import { OpenRentAgreementComponent } from './rent-agreements/open-rent-agreement.component';
import { AddTenantsComponent } from './rent-agreements/add-tenants.component';

export const routes: Routes = [
  { path: '', redirectTo: 'rent-agreements/create', pathMatch: 'full' },
  { path: 'rent-agreements/create', component: RentAgreementCreateComponent },
  { path: 'rent-agreements/open', component: OpenRentAgreementComponent },
  // Appends one fee to an already-saved lease, charged to a chosen subset of its tenants. Declared
  // above the `:id`-parameterised routes below: `additional-charges` would otherwise be matched as an
  // agreement id by whichever of them came first.
  //
  // Lazy-loaded, unlike its siblings: eagerly imported it pushed the initial bundle from 791 kB to
  // 809 kB, past the 800 kB budget in `angular.json`. Deferring the one screen that is reached
  // deliberately, rather than raising the budget for every screen, is the cheaper answer.
  {
    path: 'rent-agreements/additional-charges',
    loadComponent: () =>
      import('./rent-agreements/add-additional-charge.component').then(
        (m) => m.AddAdditionalChargeComponent
      )
  },
  // Same component as create — it switches to edit mode when the route carries an id, loading the
  // saved agreement instead of starting blank.
  { path: 'rent-agreements/:id/edit', component: RentAgreementCreateComponent },
  // Step 2 of the lease wizard, reached after a fresh create or via "Manage Tenants" from edit.
  { path: 'rent-agreements/:id/tenants', component: AddTenantsComponent },
  { path: 'rent-schedule/preview', component: RentSchedulePreviewComponent },
  // One owner's invoices, filtered and paged. Each row links to the correction page below with
  // `?invoiceId=`, which is what makes that page reachable without knowing an id by heart.
  {
    path: 'invoices',
    loadComponent: () => import('./invoices/invoice-list.component').then((m) => m.InvoiceListComponent)
  },
  // Corrects one invoice: looked up by invoice id, corrected through the proposal behind it. Lazy for
  // the same bundle-budget reason as the additional-fee page above.
  {
    path: 'invoices/update',
    loadComponent: () =>
      import('./invoices/update-proposed-invoice.component').then(
        (m) => m.UpdateProposedInvoiceComponent
      )
  }
];
