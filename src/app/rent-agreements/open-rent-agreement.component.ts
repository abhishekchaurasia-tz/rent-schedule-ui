import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entry point for opening a saved lease: paste a rent agreement id and go straight to the
 * add/edit lease screen with that agreement loaded.
 *
 * There is no lease list to pick from — this service has no "search agreements" endpoint, only
 * fetch-by-id — so an id box is the whole navigation surface for now. The id is validated for shape
 * here only; whether it actually exists is decided by the edit screen's load.
 */
@Component({
  selector: 'app-open-rent-agreement',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './open-rent-agreement.component.html',
  styleUrl: './open-rent-agreement.component.scss'
})
export class OpenRentAgreementComponent {
  readonly agreementId = new FormControl('', { nonNullable: true });

  readonly error = signal<string | null>(null);

  constructor(private readonly router: Router) {}

  /** Navigates to the edit screen, or explains why the id cannot be used. */
  open(): void {
    const id = this.agreementId.value.trim();

    if (!id) {
      this.error.set('Enter a rent agreement id.');
      return;
    }

    if (!GUID_PATTERN.test(id)) {
      this.error.set('That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.');
      return;
    }

    this.error.set(null);
    void this.router.navigate(['/rent-agreements', id, 'edit']);
  }
}
