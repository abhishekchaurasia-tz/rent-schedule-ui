import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { ActivateLeaseComponent } from './activate-lease.component';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AgreementTenantShareRequest,
  AgreementTenantShareResponse,
  AgreementTenantsResponse,
  RentAgreementDetailResponse,
  SaveAgreementTenantsRequest
} from './rent-agreement.models';

/** Which of a tenant's Rent/Deposit fields is user-editable; the other is derived and greyed out. */
export type SplitUnit = 'percent' | 'dollar';

/** Whether this screen is filling in step 2 for the first time, or revising what it already holds. */
export type TenantsMode = 'create' | 'edit';

/**
 * Step 2 of the lease wizard: the renter set and its two invoicing decisions, saved as one
 * transaction to `PUT /rent-agreements/{id}/tenants`.
 *
 * **One component for both create and edit.** On open it asks
 * `GET /rent-agreements/{id}/tenants` what the server already holds. A `204` means step 2 was never
 * saved, so the screen starts blank in *create* mode with one row at 100%. A body means it was, so
 * every saved row is re-created here — same tenant ids, same shares, same invoicing decisions — and
 * the screen is in *edit* mode. Save is the same whole-set replace either way, which is what makes
 * one component correct rather than merely convenient: the server has no separate "add" and "update"
 * to mirror.
 *
 * The distinction matters for one behaviour in particular: an even re-split across rows is a
 * *create*-mode default. Running it after a prefill would overwrite the split the owner deliberately
 * entered with an even one, so it is skipped when saved rows are applied.
 *
 * **On the identity fields.** There is no tenant-profile service wired up in this demo app — the same
 * gap that leaves `propertyId`/`propertyUnitId`/`propertyOwnerId` as client-generated placeholders on
 * the create screen. The endpoint carries no personal fields either: it stores shares against a
 * `tenantId` and nothing else. So first/last name, email and mobile are **placeholders on every row**,
 * whether it was just added here or came back from the server — a blank row could not be saved anyway,
 * since both names are `required` and there is nothing real to type.
 *
 * Each placeholder person is **derived from that row's `tenantId`**, not drawn at random. The effect is
 * still a different person per row, because the id of a new row is itself random; what derivation buys
 * is *stability* — the row keeps its person for as long as it exists, and comes back as the same person
 * when the screen is re-opened. A name that changed on every load would look like the data had changed
 * when nothing had. Every field stays editable.
 *
 * The **`tenantId` itself is real and is never regenerated on prefill** — it is the only identity the
 * server knows, it is what a re-save reconciles against, and it is shown on each row so it can be
 * checked against the API by eye.
 *
 * The backend does not require the rent or deposit splits to sum to 100% or to the agreement's
 * full rent/deposit — so this screen never blocks Save on that, it only surfaces the running totals.
 */
@Component({
  selector: 'app-add-tenants',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ActivateLeaseComponent],
  templateUrl: './add-tenants.component.html',
  styleUrl: './add-tenants.component.scss'
})
export class AddTenantsComponent {
  readonly agreementId: string;

  readonly loadingAgreement = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly loadedAgreement = signal<RentAgreementDetailResponse | null>(null);

  /**
   * What the server already holds for step 2, or `null` when it holds nothing yet (`204`). This is
   * the one signal that decides which mode the screen is in.
   */
  readonly savedTenants = signal<AgreementTenantsResponse | null>(null);

  /** `edit` once a saved set has been prefilled; `create` while step 2 has never been saved. */
  readonly mode = computed<TenantsMode>(() => (this.savedTenants() ? 'edit' : 'create'));

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
        // Only now: the saved shares are read against a lease whose full rent and deposit are already
        // known, so a row's percent/dollar pair can be completed without a second pass.
        this.loadSavedTenants();
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(AddTenantsComponent.describeError(err));
        this.loadingAgreement.set(false);
      }
    });
  }

  /**
   * Asks the server what step 2 already holds, and puts the screen into the matching mode.
   *
   * A `null` body is the `204`: step 2 was never saved, so this stays a blank *create* screen with
   * the usual even split. Anything else is prefilled verbatim.
   */
  private loadSavedTenants(): void {
    this.rentAgreementsService.getTenants(this.agreementId).subscribe({
      next: (saved) => {
        // The empty-array arm is defensive only: the endpoint rejects a save with no tenants, so a
        // saved-but-empty roster cannot exist. Treating it as "start blank" is the safe reading if it
        // ever did — a screen with no rows and no way to add a share would be a dead end.
        if (saved && saved.tenants.length > 0) {
          this.applySavedTenants(saved);
        } else {
          this.rebalanceEqually();
        }

        this.loadingAgreement.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(AddTenantsComponent.describeError(err));
        this.loadingAgreement.set(false);
      }
    });
  }

  /**
   * Rebuilds the form from what the server holds: one row per saved tenant, the two invoicing
   * decisions, and the input mode each share was entered in.
   *
   * **No even re-split afterwards.** That is a create-mode default, and running it here would
   * silently replace the split the owner entered with an even one.
   */
  private applySavedTenants(saved: AgreementTenantsResponse): void {
    this.savedTenants.set(saved);

    this.tenants.clear();
    saved.tenants.forEach((tenant) => this.tenants.push(this.buildSavedTenantGroup(tenant)));

    this.form.patchValue(
      {
        isGroupInvoice: saved.isGroupInvoice,
        partialPaymentAllowed: saved.partialPaymentAllowed
      },
      { emitEvent: false }
    );

    // A null percentage is how the server records "a fixed dollar amount was typed here". Re-opening
    // on that mode is the whole reason it reports the values as entered rather than as resolved.
    this.rentSplitUnit.set(saved.tenants.some((t) => t.rentPercent === null) ? 'dollar' : 'percent');
    this.depositSplitUnit.set(saved.tenants.some((t) => t.depositPercent === null) ? 'dollar' : 'percent');
  }

  /**
   * Builds a brand-new row: a freshly minted tenant id, and a placeholder person to go with it.
   *
   * **The identity is pre-filled rather than left blank.** First and last name are `required`, so a
   * blank row cannot be saved until someone types into it — and there is nothing real to type, since
   * this app has no tenant directory and the endpoint stores no personal fields anyway. Pre-filling
   * makes the row immediately saveable and keeps every row on this screen consistent, whether it came
   * from the server or was just added here.
   *
   * The name is effectively **random per row** because it is derived from the row's freshly generated
   * `tenantId` — but derived rather than drawn at random, which is what makes it *stable*: the row
   * keeps the same person for as long as it exists, and comes back as the same person when the screen
   * is re-opened after a save. Every field stays editable; nothing but the `tenantId` is sent.
   */
  private buildTenantGroup(rentPercent: number, depositPercent: number): FormGroup {
    const rentAmount = AddTenantsComponent.round((rentPercent / 100) * this.fullRent());
    const depositAmount = AddTenantsComponent.round((depositPercent / 100) * this.depositTotal());

    const tenantId = crypto.randomUUID();
    const identity = placeholderTenantIdentity(tenantId);

    return this.fb.group({
      tenantId: [tenantId],
      firstName: [identity.firstName, Validators.required],
      lastName: [identity.lastName, Validators.required],
      email: [identity.email],
      mobile: [identity.mobile],
      rentPercent: [rentPercent],
      rentAmount: [rentAmount],
      depositPercent: [depositPercent],
      depositAmount: [depositAmount]
    });
  }

  /**
   * Builds one row from a saved tenant.
   *
   * The `tenantId` is carried across **exactly** — never re-minted — because it is the key the
   * server reconciles a re-save against. Mint a new one here and the save would deactivate the real
   * tenant and insert a stranger in their place.
   *
   * The missing half of each percent/dollar pair is derived from the lease's totals, so the greyed-out
   * column reads correctly whichever mode the row re-opens in.
   */
  private buildSavedTenantGroup(tenant: AgreementTenantShareResponse): FormGroup {
    const identity = placeholderTenantIdentity(tenant.tenantId);
    const fullRent = this.fullRent();
    const depositTotal = this.depositTotal();

    const rentPercent =
      tenant.rentPercent ?? (fullRent > 0 ? AddTenantsComponent.round((tenant.rentAmount / fullRent) * 100) : 0);
    const depositPercent =
      tenant.depositPercent ??
      (depositTotal > 0 ? AddTenantsComponent.round((tenant.deposit / depositTotal) * 100) : 0);

    return this.fb.group({
      tenantId: [tenant.tenantId],
      firstName: [identity.firstName, Validators.required],
      lastName: [identity.lastName, Validators.required],
      email: [identity.email],
      mobile: [identity.mobile],
      rentPercent: [rentPercent],
      rentAmount: [AddTenantsComponent.round(tenant.rentAmount)],
      depositPercent: [depositPercent],
      depositAmount: [AddTenantsComponent.round(tenant.deposit)]
    });
  }

  /** The real tenant id behind a row — shown on screen so it can be checked against the API by eye. */
  tenantIdAt(index: number): string {
    return this.tenants.at(index).get('tenantId')!.value as string;
  }

  /**
   * Adds a row, and in *create* mode re-spreads the totals evenly across every row.
   *
   * In *edit* mode the new row starts at zero and nothing else moves: the existing rows carry a split
   * the owner entered deliberately, and adding a fifth tenant is no reason to overwrite it. They set
   * the new row's share themselves, and the running totals show where they stand.
   */
  addTenant(): void {
    this.tenants.push(this.buildTenantGroup(0, 0));

    if (this.mode() === 'create') {
      this.rebalanceEqually();
    }
  }

  /**
   * Removes a row, re-spreading evenly in *create* mode only — for the same reason
   * {@link addTenant} does not.
   *
   * A tenant removed here is **deactivated, not deleted**, once the save goes through: they are
   * simply absent from the whole-set replace, and the invoices already raised against them survive.
   */
  removeTenant(index: number): void {
    if (this.tenants.length <= 1) {
      return;
    }
    this.tenants.removeAt(index);

    if (this.mode() === 'create') {
      this.rebalanceEqually();
    }
  }

  /**
   * Spreads the rent/deposit totals evenly across every current row — the "N tenants split evenly"
   * default a blank screen starts from, re-run whenever a row is added or removed **in create mode**.
   * A row the user has since hand-edited is not specially preserved: re-spreading keeps the model
   * simple, and the backend places no requirement on the split summing to 100% anyway.
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

  /**
   * Re-reads the lease after an activation, so the status the screen shows — and with it whether the
   * Activate button is still offered — matches the server rather than the state before the call.
   *
   * Only the agreement is re-read, not the tenants: activation does not touch the roster, and re-reading
   * it would throw away any edit the user had in progress on this screen.
   */
  onActivated(): void {
    this.rentAgreementsService.getById(this.agreementId).subscribe({
      next: (agreement) => this.loadedAgreement.set(agreement),
      error: () => {
        // Deliberately swallowed: the activation itself succeeded and its own banner says so. A failed
        // refresh means the status chip is stale, which a reload fixes — it is not worth overwriting a
        // success message with an error about a follow-up read.
      }
    });
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

        // Step 2 now exists on the server, so this screen is an edit from here on — without a reload.
        // Recorded from the request rather than re-fetching: the save is a whole-set replace, so what
        // was sent *is* what is now stored, and the echoed ids confirm it.
        this.savedTenants.set({
          isGroupInvoice: request.isGroupInvoice,
          partialPaymentAllowed: request.partialPaymentAllowed,
          tenants: request.tenants.map((tenant) => ({
            tenantId: tenant.tenantId,
            rentAmount: tenant.rentAmount,
            rentPercent: tenant.rentPercent,
            deposit: tenant.deposit,
            depositPercent: tenant.depositPercent
          }))
        });
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
