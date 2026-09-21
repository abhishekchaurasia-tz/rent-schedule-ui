import { CommonModule } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { AgreementTenantShareResponse } from './rent-agreement.models';
import {
  PAID_SUBJECT,
  ShareUnit,
  SplitTableRow,
  TenantShareInput,
  TenantShareOverride,
  buildSplitTable,
  percentageBlocker,
  splitBlocker,
  toTenantShareInputs
} from './tenant-split.util';

/** What the editor reports upward on every change — the split, and why it cannot be saved. */
export interface TenantSplitState {
  /** The `tenantShares` array, or `undefined` for a fee shared by every renter. */
  shares: TenantShareInput[] | undefined;
  /** A requirement 19 refusal, or `null` when the split is savable. */
  blocker: string | null;
}

/**
 * The per-renter split editor — *"Shared Lease / Split per Tenant"*, and the table under it.
 *
 * **Why this is its own component rather than markup inside the fee panel.** Three hosts need the
 * same split and one must never show it: the Add Additional Fee page and the Invoices page both author
 * who pays, while the lease create/edit screens author the fee alone and are explicitly not getting a
 * renter control (spec `02` requirement 22). The fee panel decides which it is by whether its host
 * handed it a roster; this component is what it shows when the answer is yes. It also keeps the
 * split's stylesheet under its own per-component budget instead of on top of the panel's.
 *
 * **It owns the split and nothing else.** It is told the renters and the fee total and reports the
 * shares back; it does not know which endpoint they are going to, or that there is one.
 */
@Component({
  selector: 'app-tenant-split-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tenant-split-editor.component.html',
  styleUrl: './tenant-split-editor.component.scss'
})
export class TenantSplitEditorComponent {
  /**
   * The lease's **active** renters, in roster order — the order leftover cents are handed out in.
   *
   * Empty is a real state: a lease whose step 2 was saved with nobody on it, or never saved at all.
   * The host says which by what it renders around this editor; here both simply mean "nobody to
   * split between", and the fee stays shared.
   */
  readonly tenants = input<readonly AgreementTenantShareResponse[]>([]);

  /** The fee being divided, summed from the panel's item amounts. */
  readonly feeTotal = input<number>(0);

  /**
   * What has already been paid on this fee, divided the same way.
   *
   * The charge carries one figure for this and the server would otherwise divide it itself, which is
   * the hazard requirement 17 exists for — one division shown, a different one stored. Dividing it
   * here and sending the result leaves nothing to infer.
   */
  readonly alreadyPaid = input<number>(0);

  /** Whether the lease bills on one shared invoice — wording only, never sent. */
  readonly isGroupInvoice = input<boolean>(false);

  /** The split and its blocker, re-emitted whenever either changes. */
  readonly splitChange = output<TenantSplitState>();

  /**
   * Who the fee is charged to. **Empty is a complete instruction, not an unfinished one:** it means
   * every active renter shares the fee, which is what sending no `tenantShares` says on the wire.
   */
  private readonly selectedTenantIds = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * The fee shares the owner has typed over, keyed by renter (requirement 18).
   *
   * **A typed row is not re-divided when the selection changes** — only untouched rows absorb it. An
   * owner who has fixed one number does not expect the page to undo that because they ticked somebody
   * else, and this map is what remembers which numbers were theirs.
   */
  private readonly amountOverrides = signal<ReadonlyMap<string, TenantShareOverride>>(new Map());

  /**
   * The unit the **whole split** is typed in (requirement 18, as corrected in v11).
   *
   * One value for the table, not one per row, because the service sums the percentages a request
   * states and requires exactly `100.00` — a mixture states some of them and totals a hundred only
   * by coincidence. Holding it here is what stops the page from building a body that cannot be
   * accepted.
   */
  readonly splitUnit = signal<ShareUnit>('amount');

  /**
   * The paid amounts the owner has typed over — a separate map, deliberately.
   *
   * The two columns divide two different figures, so fixing what one renter owes must not disturb what
   * another has paid. One map keyed by renter could not tell the two apart.
   *
   * **Money only.** There is no percentage of an already-paid figure on the wire — the share carries
   * `alreadyPaid`, never an `alreadyPaidPercent` — so this column has no unit to choose.
   */
  private readonly paidOverrides = signal<ReadonlyMap<string, TenantShareOverride>>(new Map());

  /** Whether the fee is shared by everybody — the state an empty selection encodes. */
  readonly isSharedByEveryone = computed(() => this.selectedTenantIds().size === 0);

  /** Whether any row has been typed over — what the "reset to even" control is offered for. */
  readonly hasTypedShares = computed(
    () => this.amountOverrides().size > 0 || this.paidOverrides().size > 0
  );

  /** The ticked renters in roster order, named. */
  private readonly selectedTenants = computed(() =>
    this.tenants()
      .filter((tenant) => this.selectedTenantIds().has(tenant.tenantId))
      .map((tenant) => ({ tenantId: tenant.tenantId, name: this.tenantName(tenant.tenantId) }))
  );

  /** The split table: each renter's slice of the fee, of what is paid, and what that leaves owing. */
  readonly rows = computed<SplitTableRow[]>(() =>
    buildSplitTable(
      this.selectedTenants(),
      this.feeTotal(),
      this.alreadyPaid(),
      this.amountOverrides(),
      this.paidOverrides(),
      this.splitUnit()
    )
  );

  /**
   * One entry per **roster** renter, carrying its share when ticked and `null` when not.
   *
   * The table lists the whole roster so an unticked renter can be ticked back, while {@link rows}
   * holds only the ticked ones because only they have a share. Pairing them here keeps the template
   * from searching `rows()` once per roster entry.
   */
  readonly rosterRows = computed(() => {
    const byTenant = new Map(this.rows().map((row) => [row.tenantId, row] as const));

    return this.tenants().map((tenant) => ({
      tenantId: tenant.tenantId,
      name: this.tenantName(tenant.tenantId),
      initials: this.tenantInitials(tenant.tenantId),
      selected: this.selectedTenantIds().has(tenant.tenantId),
      // The stand-in names are drawn from 16 x 16 combinations, so two renters on one lease can read
      // as the same person -- observed on a three-way split, two rows both called "Bilal Mensah".
      // The old roster list showed the id beside the name for exactly this reason; the split table
      // needs it more, because its rows carry different money.
      shortId: tenant.tenantId.slice(0, 8),
      share: byTenant.get(tenant.tenantId) ?? null
    }));
  });

  /** What the fee shares currently add up to. */
  readonly splitTotal = computed(
    () => this.rows().reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
  );

  /** What the paid amounts currently add up to. */
  readonly paidTotal = computed(
    () => this.rows().reduce((sum, row) => sum + Math.round(row.paidAmount * 100), 0) / 100
  );

  /** What the renters still owe between them. */
  readonly owesTotal = computed(
    () => Math.round((this.splitTotal() - this.paidTotal()) * 100) / 100
  );

  /**
   * Why the split cannot be saved, or `null` (requirement 19).
   *
   * **Two columns, two things that have to add up**, and the fee is reported first: an owner who has
   * the fee wrong is usually about to change the paid figures anyway, and two messages at once names
   * neither clearly.
   */
  readonly blocker = computed(() => {
    const feeRows = this.rows();
    const fee = splitBlocker(feeRows, this.feeTotal());
    if (fee !== null) {
      return fee;
    }

    // Also about the fee, so it is named before the paid column and after the money. The two sums
    // are independent: amounts that total the fee exactly say nothing about whether the percentages
    // stated beside them reach a hundred, and the service refuses either.
    const percentages = percentageBlocker(feeRows, this.splitUnit());
    if (percentages !== null) {
      return percentages;
    }

    const paidRows = feeRows.map((row) => ({
      ...row,
      amount: row.paidAmount,
      error: row.paidError
    }));
    return splitBlocker(paidRows, this.alreadyPaid(), PAID_SUBJECT);
  });

  constructor() {
    // One effect rather than an emit inside every handler: the split is a function of the selection,
    // the typed rows and the fee total, and the last of those changes without anything here being
    // called at all — the owner edits an item's rate in the panel above.
    effect(() => {
      this.splitChange.emit({
        shares: toTenantShareInputs(this.rows(), this.splitUnit()),
        blocker: this.blocker()
      });
    });
  }

  /** The stand-in person for a renter id — the same one the ADD TENANTS screen shows. */
  tenantName(tenantId: string): string {
    const identity = placeholderTenantIdentity(tenantId);
    return `${identity.firstName} ${identity.lastName}`;
  }

  /**
   * The stand-in person's initials, for the row's avatar.
   *
   * Initials rather than a portrait, and not for want of styling: there is no tenant-profile service,
   * so the name itself is derived from the id. Two letters in a circle says "a person this screen
   * knows only by id"; a stock photograph would claim to know who they are.
   */
  tenantInitials(tenantId: string): string {
    const identity = placeholderTenantIdentity(tenantId);
    return `${identity.firstName.charAt(0)}${identity.lastName.charAt(0)}`.toUpperCase();
  }

  isTenantSelected(tenantId: string): boolean {
    return this.selectedTenantIds().has(tenantId);
  }

  toggleTenant(tenantId: string): void {
    this.selectedTenantIds.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(tenantId)) {
        next.add(tenantId);
      }
      return next;
    });
  }

  /**
   * Switches between the two things a fee can be: shared by the whole lease, or split per renter.
   *
   * These are the two ends of one selection rather than a mode of their own — an empty selection *is*
   * "shared by everyone", which is the server's own encoding. So choosing "split per renter" from an
   * empty selection has to tick somebody, and ticking everybody is the only choice that changes
   * nothing about who owes the fee while making the split editable.
   */
  setSplitMode(mode: 'shared' | 'split'): void {
    if (mode === 'shared') {
      this.selectedTenantIds.set(new Set<string>());
      this.resetSplit();
      return;
    }
    if (this.selectedTenantIds().size === 0) {
      this.selectedTenantIds.set(new Set(this.tenants().map((tenant) => tenant.tenantId)));
    }
  }

  /**
   * Records what the owner typed into a row, read in the split's unit (requirement 18).
   *
   * The text is stored, not a number: it is echoed straight back into the input, so a value the page
   * cannot read stays on screen to be corrected rather than being replaced by a zero.
   */
  typeShare(tenantId: string, text: string): void {
    this.amountOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.set(tenantId, { text });
      return next;
    });
  }

  /**
   * Records what the owner typed into a row's **paid** box.
   *
   * Same rule as the fee share, on the other figure: the rows nobody has touched share what is left of
   * the charge's `alreadyPaid`, so saying one renter has paid $100 of a $150 deposit leaves the rest to
   * the others rather than re-dividing everything.
   */
  typePaid(tenantId: string, text: string): void {
    this.paidOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.set(tenantId, { text });
      return next;
    });
  }

  /**
   * Switches the **whole split** between money and percentage, carrying every typed row's figure
   * across into the new unit (requirement 18, as corrected in v11).
   *
   * **One control for the table, because the unit is not a property of a row.** v7 put a selector on
   * each row, which let the owner state one renter's share as a percentage and leave the rest as
   * money — a body the service always refuses, because it sums the percentages a request states and
   * requires exactly `100.00`. Converting every typed row together is what keeps the payload to the
   * two shapes that can be accepted.
   *
   * **Untouched rows stay untouched.** They are still dividing what the typed rows leave, and a row
   * nobody has typed has no figure of its own to convert.
   *
   * **The amounts can move by a cent, and requirement 24 is about saying so.** An even `$300` three
   * ways is `100.00` each, and `33.33 %` of `300` is `99.99` — `100.00 / 100.00 / 100.00` simply has
   * no expression as three percentages of `300`. This method does not yet disclose that; FR 24 is a
   * separate milestone behind an open question about how loudly to.
   */
  setSplitUnit(unit: ShareUnit): void {
    if (this.splitUnit() === unit) {
      return;
    }

    const rows = new Map(this.rows().map((row) => [row.tenantId, row] as const));

    this.amountOverrides.update((overrides) => {
      const next = new Map<string, TenantShareOverride>();

      for (const [tenantId] of overrides) {
        const row = rows.get(tenantId);
        // A row the page could not read has nothing to carry, so its text goes across untouched and
        // stays on screen to be corrected.
        next.set(tenantId, {
          text:
            !row || row.error !== null
              ? (overrides.get(tenantId)!.text ?? '')
              : unit === 'percent'
                ? row.sharePercent.toFixed(2)
                : row.amount.toFixed(2)
        });
      }

      return next;
    });

    this.splitUnit.set(unit);
  }

  /** Hands one row's fee share back to the even division, leaving every other typed row alone. */
  resetShareRow(tenantId: string): void {
    this.amountOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.delete(tenantId);
      return next;
    });
  }

  /** Hands one row's paid amount back to the even division, leaving its fee share as typed. */
  resetPaidRow(tenantId: string): void {
    this.paidOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.delete(tenantId);
      return next;
    });
  }

  /**
   * Discards every typed row and divides the fee evenly again (requirement 19).
   *
   * **Only ever on a click.** A mismatched total keeps what the owner typed; this is the deliberate
   * way back, not something the page does on their behalf when it dislikes the numbers.
   */
  resetSplit(): void {
    this.amountOverrides.set(new Map());
    this.paidOverrides.set(new Map());
  }
}
