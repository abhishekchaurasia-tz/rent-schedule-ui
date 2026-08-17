import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { RentAgreementsService } from './rent-agreements.service';
import { AgreementTenantShareRequest, RentAgreementDetailResponse, SaveAgreementTenantsRequest } from './rent-agreement.models';

/** Which of a tenant's Rent/Deposit fields is user-editable; the other is derived and greyed out. */
export type SplitUnit = 'percent' | 'dollar';

/**
 * Step 2 of the lease wizard: "ADD TENANTS" — the renter set and its two invoicing decisions,
 * saved as one transaction to `PUT /rent-agreements/{id}/tenants`.
 *
 * There is no tenant-profile service wired up yet in this demo app — the same gap that leaves
 * `propertyId`/`propertyUnitId`/`propertyOwnerId` as client-generated placeholders on the create
 * screen. `tenantId` here is minted the same way (`crypto.randomUUID()`), kept stable per row for
 * the lifetime of this form, and never resolved against anything real. First/last name, email and
 * mobile are captured for the UI only — the backend contract for this endpoint carries no personal
 * fields, only the share amounts.
 *
 * The backend does not require the rent or deposit splits to sum to 100% or to the agreement's
 * full rent/deposit (see the endpoint's Postman notes) — so this screen never blocks Save on that,
 * it only surfaces the running totals.
 */
@Component({
  selector: 'app-add-tenants',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-tenants.component.html',
  styleUrl: './add-tenants.component.scss'
})
export class AddTenantsComponent {
  readonly agreementId: string;

  readonly loadingAgreement = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly loadedAgreement = signal<RentAgreementDetailResponse | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveResult = signal<{ tenantIds: string[] } | null>(null);

  readonly rentSplitUnit = signal<SplitUnit>('percent');
  readonly depositSplitUnit = signal<SplitUnit>('percent');

  readonly form: FormGroup;

  readonly fullRent = computed(() => this.loadedAgreement()?.fullRent ?? 0);
  readonly depositTotal = computed(() => this.loadedAgreement()?.deposit ?? 0);

  constructor(
    private readonly fb: FormBuilder,
    private readonly rentAgreementsService: RentAgreementsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.agreementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.form = this.fb.group({
      isGroupInvoice: [true],
      partialPaymentAllowed: [true],
      tenants: this.fb.array([this.buildTenantGroup(100, 100)])
    });

    this.loadAgreement();
  }

  get tenants(): FormArray {
    return this.form.get('tenants') as FormArray;
  }

  private loadAgreement(): void {
    if (!this.agreementId) {
      this.loadError.set('No lease id was given — open this screen from an existing lease.');
      return;
    }

    this.loadingAgreement.set(true);
    this.loadError.set(null);

    this.rentAgreementsService.getById(this.agreementId).subscribe({
      next: (agreement) => {
        this.loadedAgreement.set(agreement);
        this.loadingAgreement.set(false);
        this.rebalanceEqually();
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(AddTenantsComponent.describeError(err));
        this.loadingAgreement.set(false);
      }
    });
  }

  private buildTenantGroup(rentPercent: number, depositPercent: number): FormGroup {
    const rentAmount = AddTenantsComponent.round((rentPercent / 100) * this.fullRent());
    const depositAmount = AddTenantsComponent.round((depositPercent / 100) * this.depositTotal());

    return this.fb.group({
      tenantId: [crypto.randomUUID()],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: [''],
      mobile: [''],
      rentPercent: [rentPercent],
      rentAmount: [rentAmount],
      depositPercent: [depositPercent],
      depositAmount: [depositAmount]
    });
  }

  addTenant(): void {
    this.tenants.push(this.buildTenantGroup(0, 0));
    this.rebalanceEqually();
  }

  removeTenant(index: number): void {
    if (this.tenants.length <= 1) {
      return;
    }
    this.tenants.removeAt(index);
    this.rebalanceEqually();
  }

  /**
   * Spreads the rent/deposit totals evenly across every current row — run whenever a row is added
   * or removed, mirroring the "N tenants split evenly" default the screenshot starts from. A row the
   * user has since hand-edited is not specially preserved: re-spreading on every add/remove keeps
   * the model simple, and the backend places no requirement on the split summing to 100% anyway.
   */
  private rebalanceEqually(): void {
    const count = this.tenants.length;
    if (count === 0) {
      return;
    }

    const equalPercent = AddTenantsComponent.round(100 / count);
    this.tenants.controls.forEach((control, index) => {
      // The last row absorbs the rounding remainder so the percentages sum to exactly 100.
      const percent =
        index === count - 1 ? AddTenantsComponent.round(100 - equalPercent * (count - 1)) : equalPercent;
      control.patchValue(
        {
          rentPercent: percent,
          rentAmount: AddTenantsComponent.round((percent / 100) * this.fullRent()),
          depositPercent: percent,
          depositAmount: AddTenantsComponent.round((percent / 100) * this.depositTotal())
        },
        { emitEvent: false }
      );
    });
  }

  setRentSplitUnit(unit: SplitUnit): void {
    this.rentSplitUnit.set(unit);
  }

  setDepositSplitUnit(unit: SplitUnit): void {
    this.depositSplitUnit.set(unit);
  }

  /** Percent edited by hand ⇒ recompute this row's dollar amount from the agreement's full rent. */
  onRentPercentChanged(index: number): void {
    const group = this.tenants.at(index);
    const percent = Number(group.get('rentPercent')!.value) || 0;
    group.get('rentAmount')!.setValue(AddTenantsComponent.round((percent / 100) * this.fullRent()), {
      emitEvent: false
    });
  }

  /** Dollar amount edited by hand ⇒ recompute this row's percent of the agreement's full rent. */
  onRentAmountChanged(index: number): void {
    const group = this.tenants.at(index);
    const amount = Number(group.get('rentAmount')!.value) || 0;
    const total = this.fullRent();
    group.get('rentPercent')!.setValue(total > 0 ? AddTenantsComponent.round((amount / total) * 100) : 0, {
      emitEvent: false
    });
  }

  onDepositPercentChanged(index: number): void {
    const group = this.tenants.at(index);
    const percent = Number(group.get('depositPercent')!.value) || 0;
    group.get('depositAmount')!.setValue(AddTenantsComponent.round((percent / 100) * this.depositTotal()), {
      emitEvent: false
    });
  }

  onDepositAmountChanged(index: number): void {
    const group = this.tenants.at(index);
    const amount = Number(group.get('depositAmount')!.value) || 0;
    const total = this.depositTotal();
    group.get('depositPercent')!.setValue(total > 0 ? AddTenantsComponent.round((amount / total) * 100) : 0, {
      emitEvent: false
    });
  }

  rentPercentTotal(): number {
    return AddTenantsComponent.round(
      this.tenants.controls.reduce((sum, c) => sum + Number(c.get('rentPercent')!.value || 0), 0)
    );
  }

  rentAmountTotal(): number {
    return AddTenantsComponent.round(
      this.tenants.controls.reduce((sum, c) => sum + Number(c.get('rentAmount')!.value || 0), 0)
    );
  }

  depositPercentTotal(): number {
    return AddTenantsComponent.round(
      this.tenants.controls.reduce((sum, c) => sum + Number(c.get('depositPercent')!.value || 0), 0)
    );
  }

  depositAmountTotal(): number {
    return AddTenantsComponent.round(
      this.tenants.controls.reduce((sum, c) => sum + Number(c.get('depositAmount')!.value || 0), 0)
    );
  }

  tenantDisplayName(index: number): string {
    const group = this.tenants.at(index);
    const name = `${group.get('firstName')!.value || ''} ${group.get('lastName')!.value || ''}`.trim();
    return name || `Tenant ${index + 1}`;
  }

  cancel(): void {
    void this.router.navigate(['/rent-agreements', this.agreementId, 'edit']);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const depositTotal = this.depositTotal();
    const value = this.form.value;

    const request: SaveAgreementTenantsRequest = {
      isGroupInvoice: Boolean(value.isGroupInvoice),
      partialPaymentAllowed: Boolean(value.partialPaymentAllowed),
      tenants: value.tenants.map(
        (tenant: any): AgreementTenantShareRequest => ({
          tenantId: tenant.tenantId,
          rentAmount: Number(tenant.rentAmount) || 0,
          rentPercent: Number(tenant.rentPercent) || 0,
          deposit: depositTotal > 0 ? Number(tenant.depositAmount) || 0 : 0,
          depositPercent: depositTotal > 0 ? Number(tenant.depositPercent) || 0 : null
        })
      )
    };

    this.saving.set(true);
    this.saveError.set(null);
    this.saveResult.set(null);

    this.rentAgreementsService.saveTenants(this.agreementId, request).subscribe({
      next: (response) => {
        this.saveResult.set({ tenantIds: response.tenantIds });
        this.saving.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.saveError.set(AddTenantsComponent.describeError(err));
        this.saving.set(false);
      }
    });
  }

  private static round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /** Mirrors {@link import('./rent-agreement-create.component').RentAgreementCreateComponent}'s error rendering. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
