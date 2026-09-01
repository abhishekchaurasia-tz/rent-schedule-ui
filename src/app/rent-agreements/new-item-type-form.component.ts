import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

import { LineItemResponse } from './line-item.models';
import { LineItemsService } from './line-items.service';

/**
 * The "add a new item type" row inside a line-item picker: one name box and an Add button, exactly as
 * the ADD ADDITIONAL FEE panel presents it.
 *
 * **One field, because that is what the user is asked for everywhere else.** The panel types a name and
 * nothing more, and its endpoint get-or-creates the catalog entry server-side — filing it under
 * {@link CustomItemTypeWire}, which is what `AdditionalChargeItemProvisioningService.CustomItemType` is
 * set to. This component does the same thing a step earlier, through `POST /api/v1/line-items`, because
 * the invoice-correction endpoint parses `itemType` into a fixed enum and so needs a resolved entry
 * before the line is submitted rather than after.
 *
 * The classification is therefore **not asked for**. It is the same default the additional-fee path
 * already applies to every custom item, so asking would offer a choice that screen never offers, for a
 * value that has one correct answer here.
 *
 * **The endpoint is get-or-create by name**, scoped to the owner, so typing a name that already exists
 * resolves to that entry rather than failing or duplicating it — safe to submit without searching, and
 * safe to press twice.
 */
@Component({
  selector: 'app-new-item-type-form',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-item-type-form.component.html',
  styleUrls: []
})
export class NewItemTypeFormComponent {
  /**
   * The classification a custom item is filed under, in the snake_case form the create body needs.
   *
   * `Miscellaneous`, matching `AdditionalChargeItemProvisioningService.CustomItemType` — the type the
   * backend itself assigns when the additional-fee route get-or-creates an entry from a typed name. The
   * two paths agree by construction rather than by coincidence.
   *
   * snake_case here and PascalCase on the way back: the request binds to a C# enum so the API's
   * `SnakeCaseLower` converter reads it, while `LineItemResponse.itemType` is a plain string from
   * `ToString()` that the converter never sees.
   */
  private static readonly CustomItemTypeWire = 'miscellaneous';

  /**
   * The owner a brand-new entry is scoped to. Without it there is nothing to create against, so the
   * form reports that rather than posting a request that cannot succeed.
   */
  @Input() propertyOwnerId: string | null = null;

  /** The resolved catalog entry — newly created, or the existing one that already had this name. */
  @Output() readonly created = new EventEmitter<LineItemResponse>();

  readonly name = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly lineItems: LineItemsService) {}

  /** Resolves the typed name against the catalog and emits the entry that comes back. */
  submit(): void {
    if (this.submitting()) {
      return;
    }

    const name = this.name().trim();
    if (!name) {
      return;
    }

    if (!this.propertyOwnerId) {
      this.error.set('No property owner is loaded, so a new item type cannot be created yet.');
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    this.lineItems
      .create({
        propertyOwnerId: this.propertyOwnerId,
        name,
        itemType: NewItemTypeFormComponent.CustomItemTypeWire
      })
      .subscribe({
        next: (item) => {
          this.submitting.set(false);
          this.name.set('');
          this.created.emit(item);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(NewItemTypeFormComponent.describeError(err));
        }
      });
  }

  /** Mirrors the other screens' error rendering — the RFC 9457 `detail` when the body carries one. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
