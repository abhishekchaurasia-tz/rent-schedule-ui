/**
 * One of the owner's bank accounts, exactly as merlin's
 * `Home/DropDown/GetPropertyOwnerBankDetails` returns it (`BankDetailDto`).
 *
 * **The three encrypted fields are never read here.** `bankAccountNumber`, `routingNumber` and
 * `fundingSourceId` arrive encrypted and are passed on untouched — to Billing, which passes them to
 * Finance unread (backend BR-22). Nothing in this application decrypts, logs, trims or validates
 * them; `displayBankAccountNumber` is the only account number meant for a human to see.
 *
 * Field names are merlin's, not renamed, so the mapping to its answer stays obvious.
 */
export interface OwnerBankDetail {
  bankId: string;
  bankAccountNumber: string;
  bankAccountName: string;
  routingNumber: string;
  fundingSourceId: string;
  accountHolder: string;
  accountTypeId: number;
  paymentServiceTypeId: number;
  /** Masked, for the dropdown — e.g. `****6789`. */
  displayBankAccountNumber: string;
  companyName: string;
  verifier: number | null;
}
