import { Routes } from '@angular/router';

import { RentSchedulePreviewComponent } from './rent-schedule/rent-schedule-preview.component';
import { RentAgreementCreateComponent } from './rent-agreements/rent-agreement-create.component';

export const routes: Routes = [
  { path: '', redirectTo: 'rent-agreements/create', pathMatch: 'full' },
  { path: 'rent-agreements/create', component: RentAgreementCreateComponent },
  { path: 'rent-schedule/preview', component: RentSchedulePreviewComponent }
];
