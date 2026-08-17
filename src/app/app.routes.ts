import { Routes } from '@angular/router';

import { RentSchedulePreviewComponent } from './rent-schedule/rent-schedule-preview.component';
import { RentAgreementCreateComponent } from './rent-agreements/rent-agreement-create.component';
import { OpenRentAgreementComponent } from './rent-agreements/open-rent-agreement.component';
import { AddTenantsComponent } from './rent-agreements/add-tenants.component';

export const routes: Routes = [
  { path: '', redirectTo: 'rent-agreements/create', pathMatch: 'full' },
  { path: 'rent-agreements/create', component: RentAgreementCreateComponent },
  { path: 'rent-agreements/open', component: OpenRentAgreementComponent },
  // Same component as create — it switches to edit mode when the route carries an id, loading the
  // saved agreement instead of starting blank.
  { path: 'rent-agreements/:id/edit', component: RentAgreementCreateComponent },
  // Step 2 of the lease wizard, reached after a fresh create or via "Manage Tenants" from edit.
  { path: 'rent-agreements/:id/tenants', component: AddTenantsComponent },
  { path: 'rent-schedule/preview', component: RentSchedulePreviewComponent }
];
