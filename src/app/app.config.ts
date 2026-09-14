import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { scopeHeadersInterceptor } from './scope-headers.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // The interceptor stamps OrganizationId / PropertyOwnerId onto every Billing API request (backend
    // spec 01-rent-agreement.md v89 FR-127, v90 FR-128). This file registered no interceptors before.
    provideHttpClient(withInterceptors([scopeHeadersInterceptor])),
    provideAnimationsAsync()
  ]
};
