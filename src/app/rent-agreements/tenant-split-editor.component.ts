import { CommonModule } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { AgreementTenantShareResponse } from './rent-agreement.models';
import {
  ShareUnit,
  TenantShareInput,
  TenantShareOverride,
  TenantShareRow,
  buildSplitRows,
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
   * The rows the owner has typed over, keyed by renter (requirement 18).
   *
   * **A typed row is not re-divided when the selection changes** — only untouched rows absorb it. An
   * owner who has fixed one number does not expect the page to undo that because they ticked somebody
   * else, and this map is what remembers which numbers were theirs.
   */
  private readonly shareOverrides = signal<ReadonlyMap<string, TenantShareOverride>>(new Map());

  /** Whether the fee is shared by everybody — the state an empty selection encodes. */
  readonly isSharedByEveryone = computed(() => this.selectedTenantIds().size === 0);

  /** Whether any row has been typed over — what the "reset to even" control is offered for. */
  readonly hasTypedShares = computed(() => this.shareOverrides().size > 0);

  /** The ticked renters in roster order, named. */
  private readonly selectedTenants = computed(() =>
    this.tenants()
      .filter((tenant) => this.selectedTenantIds().has(tenant.tenantId))
      .map((tenant) => ({ tenantId: tenant.tenantId, name: this.tenantName(tenant.tenantId) }))
  );

  /** The split table (requirements 17 and 18). */
  readonly rows = computed<TenantShareRow[]>(() =>
    buildSplitRows(this.selectedTenants(), this.feeTotal(), this.shareOverrides())
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
      share: byTenant.get(tenant.tenantId) ?? null
    }));
  });

  /** What the rows currently add up to. */
  readonly splitTotal = computed(
    () => this.rows().reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
  );

  /** Why the split cannot be saved, or `null` (requirement 19). */
  readonly blocker = computed(() => splitBlocker(this.rows(), this.feeTotal()));

  constructor() {
    // One effect rather than an emit inside every handler: the split is a function of the selection,
    // the typed rows and the fee total, and the last of those changes without anything here being
    // called at all — the owner edits an item's rate in the panel above.
    effect(() => {
      this.splitChange.emit({ shares: toTenantShareInputs(this.rows()), blocker: this.blocker() });
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
      this.shareOverrides.set(new Map());
      return;
    }
    if (this.selectedTenantIds().size === 0) {
      this.selectedTenantIds.set(new Set(this.tenants().map((tenant) => tenant.tenantId)));
    }
  }

  /**
   * Records what the owner typed into a row, in whichever unit that row is set to (requirement 18).
   *
   * The text is stored, not a number: it is echoed straight back into the input, so a value the page
   * cannot read stays on screen to be corrected rather than being replaced by a zero.
   */
  typeShare(tenantId: string, text: string): void {
    this.shareOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.set(tenantId, { unit: overrides.get(tenantId)?.unit ?? 'amount', text });
      return next;
    });
  }

  /**
   * Switches a row between money and percentage, **carrying the figure across** so what the renter
   * owes does not move because the owner changed their mind about how to say it.
   *
   * Doing this to an untouched row makes it a typed one, at the value it was just divided to. Choosing
   * a unit for a row *is* taking it over: it is the only reason to touch that control, and a row that
   * kept re-dividing afterwards would throw the choice away the moment another renter was ticked.
   */
  setShareUnit(tenantId: string, unit: ShareUnit): void {
    const row = this.rows().find((candidate) => candidate.tenantId === tenantId);
    if (!row || row.authoredUnit === unit) {
      return;
    }

    // Carried across from whichever figure the row already holds. A row the page could not read has
    // nothing to carry, so its text goes across untouched.
    const text =
      row.error !== null
        ? row.text
        : unit === 'percent'
          ? row.sharePercent.toFixed(2)
          : row.amount.toFixed(2);

    this.shareOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.set(tenantId, { unit, text });
      return next;
    });
  }

  /** Hands one row back to the even division, leaving every other typed row alone. */
  resetShareRow(tenantId: string): void {
    this.shareOverrides.update((overrides) => {
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
    this.shareOverrides.set(new Map());
  }
}
