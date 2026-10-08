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
  companyName: string | null;
  verifier: number | null;
}

/**
 * One account exactly as merlin puts it on the wire: PascalCase, because that is what
 * `Home/DropDown/GetPropertyOwnerBankDetails` answers.
 *
 * **Kept separate from `OwnerBankDetail` on purpose.** merlin's casing is merlin's business, and the
 * rest of this application reads the camelCase shape every other model here uses. The mapping lives
 * in `OwnerBankService` and is the only place the two meet.
 */
export interface OwnerBankDetailWire {
  BankId: string;
  BankAccountNumber: string;
  BankAccountName: string;
  RoutingNumber: string;
  FundingSourceId: string;
  AccountHolder: string;
  AccountTypeId: number;
  PaymentServiceTypeId: number;
  DisplayBankAccountNumber: string;
  CompanyName: string | null;
  Verifier: number | null;
}

/**
 * merlin's standard envelope. The accounts are under `Data`; `Message` and `IsFeedbackSet` are the
 * monolith's own framing and nothing here reads them.
 *
 * `Data` is optional because an error-shaped answer omits it, and a missing list has to read as "no
 * accounts" rather than throwing while mapping.
 */
export interface OwnerBankListResponse {
  Data?: OwnerBankDetailWire[] | null;
}
