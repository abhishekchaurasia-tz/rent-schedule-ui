import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CandidateDateRequest,
  CandidateDateResponse,
  PreviewRentScheduleRequest,
  PreviewRentScheduleResponse
} from './rent-schedule.models';

@Injectable({ providedIn: 'root' })
export class RentScheduleService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/rent/schedule`;

  constructor(private readonly http: HttpClient) {}

  preview(request: PreviewRentScheduleRequest): Observable<PreviewRentScheduleResponse> {
    return this.http.post<PreviewRentScheduleResponse>(`${this.baseUrl}/preview`, request);
  }

  firstRentalDueDateOptions(request: CandidateDateRequest): Observable<CandidateDateResponse> {
    return this.http.post<CandidateDateResponse>(
      `${this.baseUrl}/first-rental-due-date-options`,
      request
    );
  }
}
