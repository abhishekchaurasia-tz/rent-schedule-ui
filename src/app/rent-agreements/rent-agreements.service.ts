import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { CreateRentAgreementRequest, CreateRentAgreementResponse } from './rent-agreement.models';

@Injectable({ providedIn: 'root' })
export class RentAgreementsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/rent-agreements`;

  constructor(private readonly http: HttpClient) {}

  create(request: CreateRentAgreementRequest): Observable<CreateRentAgreementResponse> {
    return this.http.post<CreateRentAgreementResponse>(this.baseUrl, request);
  }
}
