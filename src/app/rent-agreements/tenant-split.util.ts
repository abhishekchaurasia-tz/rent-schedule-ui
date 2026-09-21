/**
 * Dividing a fee between the renters who owe it — requirements 17 to 19 of
 * `docs/specs/rent-agreements/02-add-additional-charge-ui.md`.
 *
 * **Why this is a util and not part of a component.** Three screens now author a split — the Add
 * Additional Fee page, the Invoices page and, through the shared fee panel, whichever host passes a
 * roster — and the arithmetic is the part that must not differ between them. A client that divides
 * differently from the server shows the owner one set of numbers and saves another, which is the
 * defect the whole requirement exists to prevent.
 */

/**
 * Which unit a share was typed in.
 *
 * Recorded rather than inferred, because the two are not interchangeable: on a `$300` fee a typed
 * `200.00` and a typed `66.67` are different rows — `66.67%` of `300` is `200.01` — so nothing can
 * look at a stored amount afterwards and work out what was meant.
 */
export type ShareUnit = 'amount' | 'percent';

/**
 * One renter's typed-over share: the text they typed, verbatim.
 *
 * **The text is kept as typed rather than parsed into a number.** A value the page cannot read —
 * `12,50`, a stray minus, a half-finished `1.` — has to stay on screen to be corrected, and
 * requirement 19 is explicit that the page never silently rewrites what the owner entered.
 *
 * **It carries no unit of its own, and that is requirement 18 as v11 corrects it.** The unit belongs
 * to the split, not the row. While each row chose for itself the owner could state one renter's share
 * as a percentage and leave the rest as money — and the service sums the percentages a request
 * *states* and requires exactly `100.00`, so a single stated `70` was a guaranteed `422` from a
 * screen whose amounts added up perfectly. Removing the field is what makes that payload
 * unrepresentable rather than merely refused somewhere downstream.
 */
export interface TenantShareOverride {
  text: string;
}

/** One renter's share of the fee, as the split table renders it. */
export interface TenantShareRow {
  tenantId: string;
  name: string;
  amount: number;
  sharePercent: number;
  /**
   * Whether a leftover cent landed on this row — what its Odd/Even badge reads.
   *
   * Worth saying out loud because the rule is invisible otherwise: an owner reading `33.34` beside
   * `33.33` has no way to tell a deliberate remainder from a rounding bug.
   */
  carriesLeftoverCent: boolean;
  /** `even` while the row still carries its share of the division; otherwise the split's unit. */
  authoredUnit: ShareUnit | 'even';
  /**
   * The percentage the owner actually typed, or `null` on a row they did not type.
   *
   * **Kept because the derived {@link sharePercent} is not it.** That one is computed back from the
   * rounded cents, so a split authored as `33.334 / 33.333 / 33.333` re-derives as three `33.33`s
   * totalling `99.99` — refused by the service for a reason the owner never typed. What went on the
   * wire has to be what they entered.
   */
  typedPercent: number | null;
  /** What the row's input shows: the owner's own text on a typed row, the divided figure otherwise. */
  text: string;
  /** A complaint about the typed text, or `null`. Blocks the save; never rewrites the row. */
  error: string | null;
}

/** One entry of the `tenantShares` array as it goes on the wire. */
export interface TenantShareInput {
  tenantId: string;
  amount: number;
  /** Present **only** when the owner typed a percentage; its absence records that they typed money. */
  sharePercent?: number;
  /**
   * That renter's slice of what has already been paid on this fee.
   *
   * **Accepted by `AdditionalChargeTenantShareInput` since the split shipped**, and nothing here sent
   * it until the owner asked for a box to type it in. Spec `02`'s contract table listed only
   * `tenantId`, `amount` and `sharePercent`, so the field existed on the wire, in the response, and
   * nowhere in between.
   *
   * **Always sent with a split, even as `0`.** The charge carries one `alreadyPaid` figure and the
   * server would otherwise divide it itself — the same hazard requirement 17 exists for, one division
   * on screen and a different one stored. Dividing it here and saying so leaves nothing to infer.
   */
  alreadyPaid?: number;
}

/** One renter's row of the split table: their slice of the fee, of what is paid, and what is left. */
export interface SplitTableRow extends TenantShareRow {
  /** Their slice of the charge's `alreadyPaid`. */
  paidAmount: number;
  /** What the paid box shows — their own text on a typed row, the divided figure otherwise. */
  paidText: string;
  /** Whether the owner typed this row's paid amount, so it is left out of re-division. */
  paidAuthored: boolean;
  paidError: string | null;
  /** Their share of the fee less what they have paid of it. Negative when they have overpaid. */
  owes: number;
}

/** How {@link splitBlocker} names the thing that does not add up. */
export interface SplitSubject {
  /** Plural, sentence-initial — "The shares". */
  shares: string;
  /** The figure they must reach — "the fee". */
  total: string;
  /** Singular, for the unreadable-row message — "share". */
  item: string;
}

/**
 * Splits `total` across `count` rows **in money**, to the cent (requirement 17).
 *
 * **The money is divided, not the percentage.** `$300` across three renters is `100.00` three times.
 * Dividing `100 / 3 = 33.33%` and multiplying it back would have produced `99.99 / 99.99 / 100.02` —
 * a different fee from the one the owner authored, on a screen that claims to be dividing theirs.
 *
 * **Leftover cents go one each to the first rows, never stacked onto one.** `$100` across six leaves
 * four cents, so four rows carry `16.67` and two carry `16.66`. Handing all four to the first row
 * would over-bill that renter by three cents — and would still divide `$300` across three correctly,
 * which is why the six-renter case has a test of its own.
 *
 * Computed in integer cents throughout, because `0.01 * 3` is not `0.03` in binary floating point and
 * a split that has to total the fee *exactly* cannot be assembled out of values that do not add up.
 *
 * @param total The amount to divide, in whole currency units. Never negative — a renter cannot owe
 *   less than nothing, so a caller with an over-typed split clamps at zero rather than passing the
 *   shortfall down here.
 * @param count How many rows to divide it across.
 * @returns One amount per row, in the order given, summing to `total` exactly. Empty when `count < 1`.
 */
export function divideEvenly(total: number, count: number): number[] {
  if (count < 1) {
    return [];
  }

  const totalCents = Math.max(0, Math.round(total * 100));
  const base = Math.floor(totalCents / count);
  const leftover = totalCents - base * count;

  return Array.from({ length: count }, (_unused, index) => (base + (index < leftover ? 1 : 0)) / 100);
}

/**
 * How many decimal places a percentage is carried to — and it is not an arbitrary choice.
 *
 * `additional_charge_tenant_share.share_percent` is `numeric(9,6)`, so six places is exactly what the
 * service stores, losslessly. A figure the page carries to more precision than the column holds would
 * be rounded on the way in, and the stored set would no longer total the hundred the page checked.
 */
const PERCENT_PLACES = 1_000_000;

/**
 * Divides `100` across the rows in proportion to the money, to six places (requirement 24).
 *
 * **The same rule as the money, on the other figure**: whole units each, the leftover handed **one at
 * a time to the first rows in listed order**. That is what makes the percentages total exactly `100`
 * while each one still resolves back to the cent it came from.
 *
 * **Why it has to be a division and not a rounding.** Taking each row's percentage on its own —
 * `Math.round(cents / total * 10000) / 100`, which is what v7 did — gives `33.33` three times on a
 * `$300` fee: `99.99`, which the service refuses. And no fixed precision fixes that by itself, because
 * a third of a hundred does not terminate. Carrying the residue does: `33.334 / 33.333 / 33.333` is
 * `100.000` exactly, and each still resolves to `$100.00`.
 *
 * **Why six places and not three.** Three totals a hundred too, but the money stops surviving the
 * round trip above roughly `$500` — a `$1,500` fee across six renters moves a cent. Six holds for
 * every total tried, up to `$12,345.67` across seven.
 *
 * Computed through `BigInt` because `cents * 100_000_000` leaves the exact range of a `number` for a
 * large enough fee, and a division that has to total exactly `100` cannot be assembled out of values
 * that are nearly right.
 *
 * **The residue goes to rows the owner did not author**, in listed order, and only falls back to all
 * of them when every row was typed. A row whose percentage the owner entered should read back as the
 * number they entered — landing a millionth of a percent on it would answer `66.670001` to somebody
 * who typed `66.67`, which is the page rewriting their work to balance its own books.
 *
 * @param centsByRow Each row's share, in cents, in listed order.
 * @param totalCents What they add up to — the figure being divided.
 * @param isDerived Which rows the page worked out rather than the owner typing.
 * @returns One percentage per row, totalling `100` exactly. All zeros when there is nothing to divide.
 */
function dividePercentAcross(
  centsByRow: readonly number[],
  totalCents: number,
  isDerived: readonly boolean[]
): number[] {
  // Zero divided among renters is zero each, not NaN. Reachable from the paid column, which starts at
  // the charge's `alreadyPaid` and that is usually nothing at all.
  if (totalCents === 0) {
    return centsByRow.map(() => 0);
  }

  const target = 100 * PERCENT_PLACES;
  const divisor = BigInt(totalCents);
  const units = centsByRow.map((cents) => Number((BigInt(cents) * BigInt(target)) / divisor));

  let leftover = target - units.reduce((sum, unit) => sum + unit, 0);
  const eligible = isDerived.some(Boolean)
    ? centsByRow.map((_unused, index) => isDerived[index])
    : centsByRow.map(() => true);

  return units.map((unit, index) => {
    const takes = eligible[index] && leftover > 0;
    if (takes) {
      leftover -= 1;
    }
    return (unit + (takes ? 1 : 0)) / PERCENT_PLACES;
  });
}

/**
 * Renders a percentage for the box the owner types into — full precision, no trailing noise.
 *
 * An even two-way split reads `50`, not `50.000000`; a three-way one reads `33.333334`, because that
 * is genuinely what the row is and rounding it to `33.33` is what moved the money. The box has to
 * show the figure that will be sent, or the next keystroke silently discards precision the split
 * depends on.
 *
 * @param percent The percentage, already divided to at most six places.
 */
export function formatPercent(percent: number): string {
  return percent.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Reads a typed share, in cents, without ever rewriting it.
 *
 * An empty box is `0` rather than a complaint: clearing a cell to retype it is the ordinary way to
 * change one, and a message that appears between two keystrokes teaches the owner nothing. The total
 * will not add up while it stands empty, and requirement 19 says so in one place instead.
 *
 * @param text What the owner typed.
 * @param unit Which unit they typed it in.
 * @param totalCents The fee, in cents — what a percentage is taken of.
 * @returns The share in cents, and the row-level message when the text could not be read.
 */
export function readTypedShare(
  text: string,
  unit: ShareUnit,
  totalCents: number
): { cents: number; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { cents: 0, error: null };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { cents: 0, error: 'Enter a number.' };
  }
  if (value < 0) {
    return { cents: 0, error: 'A share cannot be negative.' };
  }

  return {
    cents: unit === 'percent' ? Math.round((totalCents * value) / 100) : Math.round(value * 100),
    error: null
  };
}

/**
 * Builds the split table: typed rows as typed, the rest sharing what is left of the fee.
 *
 * **Returns no rows only when there is nobody to divide between**, which is the instruction *"every
 * active renter shares this fee"*. A total of zero still produces rows, every one of them zero: the
 * paid column divides the charge's `alreadyPaid`, and that is usually nothing at all.
 *
 * **The untouched rows never go below zero.** Typing `$400` onto one row of a `$300` fee leaves the
 * others a shortfall to share, and a row reading `-$50.00` would answer a question nobody asked. The
 * remainder is floored at zero and the excess surfaces where it belongs — in {@link splitBlocker}
 * refusing a split that totals $400 of a $300 fee.
 *
 * @param tenants The renters the split covers, in **roster order** — which is the order the leftover
 *   cents are handed out in (requirement 17 says "the first renters in the listed order").
 * @param total The fee being divided, in whole currency units.
 * @param overrides The rows the owner has typed over, keyed by renter.
 * @param unit The unit **the whole split** is typed in (requirement 18, as corrected in v11). Every
 *   typed row is read in it; no row carries a unit of its own.
 */
export function buildSplitRows(
  tenants: readonly { tenantId: string; name: string }[],
  total: number,
  overrides: ReadonlyMap<string, TenantShareOverride>,
  unit: ShareUnit = 'amount'
): TenantShareRow[] {
  if (tenants.length === 0) {
    return [];
  }

  const totalCents = Math.max(0, Math.round(total * 100));

  const typed = new Map(
    tenants
      .filter((tenant) => overrides.has(tenant.tenantId))
      .map((tenant) => {
        const override = overrides.get(tenant.tenantId)!;
        return [
          tenant.tenantId,
          { ...override, ...readTypedShare(override.text, unit, totalCents) }
        ] as const;
      })
  );

  const claimedCents = [...typed.values()].reduce((sum, share) => sum + share.cents, 0);
  const untouched = tenants.filter((tenant) => !typed.has(tenant.tenantId));
  const evenAmounts = divideEvenly(Math.max(0, totalCents - claimedCents) / 100, untouched.length);
  const smallestEven = evenAmounts.length > 0 ? Math.min(...evenAmounts) : 0;

  let evenIndex = 0;
  const centsByRow = tenants.map((tenant) => {
    const share = typed.get(tenant.tenantId);
    return share ? share.cents : Math.round(evenAmounts[evenIndex++] * 100);
  });

  const percentByRow = dividePercentAcross(
    centsByRow,
    totalCents,
    tenants.map((tenant) => !typed.has(tenant.tenantId))
  );

  return tenants.map((tenant, index) => {
    const share = typed.get(tenant.tenantId);
    const cents = centsByRow[index];
    const amount = cents / 100;

    const row: TenantShareRow = {
      tenantId: tenant.tenantId,
      name: tenant.name,
      amount,
      sharePercent: percentByRow[index],
      carriesLeftoverCent: !share && amount !== smallestEven,
      authoredUnit: share ? unit : 'even',
      // Only a typed row in a percentage split has one. A row the page could not read has no number
      // to keep, and an untouched row was never typed at all -- both fall back to the derived figure
      // when the split goes on the wire, which is the honest value for a row nobody authored.
      typedPercent:
        share && unit === 'percent' && share.error === null && share.text.trim() !== ''
          ? Number(share.text.trim())
          : null,
      // A typed row echoes the owner back verbatim; a divided one shows the figure it was given.
      text: share ? share.text : amount.toFixed(2),
      error: share ? share.error : null
    };

    return row;
  });
}

/**
 * Why a split cannot be saved, or `null` when it can (requirement 19).
 *
 * **Names both figures and the gap.** *"The shares do not add up"* leaves the owner to do arithmetic
 * that has already been done; naming the total against the fee points at the row that is wrong.
 *
 * **Compared in cents.** `0.01 * 3` is not `0.03` in binary floating point, and a guard that has to
 * decide *exactly* cannot rest on a comparison that is sometimes off by a fifteenth decimal.
 *
 * No rows means a fee shared by everybody, which has nothing to check — the server divides that one.
 *
 * @param rows The split as {@link buildSplitRows} produced it.
 * @param total The figure the rows have to add up to.
 * @param subject How to name the rows and the figure — the fee by default, or what is already paid.
 */
export function splitBlocker(
  rows: readonly TenantShareRow[],
  total: number,
  subject: SplitSubject = { shares: 'The shares', total: 'the fee', item: 'share' }
): string | null {
  if (rows.length === 0) {
    return null;
  }

  const unreadable = rows.filter((row) => row.error !== null).length;
  if (unreadable > 0) {
    return unreadable === 1
      ? `One ${subject.item} cannot be read. Correct it to save this fee.`
      : `${unreadable} ${subject.item}s cannot be read. Correct them to save this fee.`;
  }

  const splitCents = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const feeCents = Math.round(total * 100);
  if (splitCents === feeCents) {
    return null;
  }

  const shares = (splitCents / 100).toFixed(2);
  const fee = (feeCents / 100).toFixed(2);
  const gap = (Math.abs(feeCents - splitCents) / 100).toFixed(2);
  const direction = splitCents > feeCents ? 'over' : 'short';

  return `${subject.shares} total $${shares}, ${subject.total} is $${fee} — $${gap} ${direction}.`;
}

/**
 * The percentage a row will state on the wire.
 *
 * **One definition, used by the projection and by the guard**, so the figure the page refuses on is
 * the figure it would have sent. Two readings of "the row's percentage" — one derived, one typed —
 * is how the split came to be refused by the service for a number nobody entered.
 */
function statedPercent(row: TenantShareRow): number {
  return row.typedPercent ?? row.sharePercent;
}

/**
 * Why a percentage split cannot be saved, or `null` (requirement 19, as extended in v11).
 *
 * **The money arm is not enough on its own, because the two sums are independent.** Percentages of
 * `33.33 / 33.33 / 33.34` and of `33.334 / 33.333 / 33.333` produce the same three amounts on a
 * `$300` fee, and only the second totals a hundred. The service checks both and refuses either;
 * without this the page would pass a split straight into a `422` it could have named itself.
 *
 * **Summed at six decimal places** rather than in hundredths. The owner may type more precision than
 * the two places a derived figure carries — `33.334` is a legitimate third of a hundred — and
 * rounding the sum to hundredths would refuse exactly that. Six places is past anything a person
 * types and clear of binary floating point, where `33.334 + 33.333 + 33.333` is not quite `100`.
 *
 * @param rows The split as {@link buildSplitTable} produced it.
 * @param unit The unit the split is typed in. A money split states no percentages and has nothing
 *   here to check.
 */
export function percentageBlocker(
  rows: readonly TenantShareRow[],
  unit: ShareUnit
): string | null {
  if (unit !== 'percent' || rows.length === 0) {
    return null;
  }

  const SCALE = 1_000_000;
  const stated = rows.reduce((sum, row) => sum + Math.round(statedPercent(row) * SCALE), 0);
  if (stated === 100 * SCALE) {
    return null;
  }

  const total = (stated / SCALE).toFixed(2);
  const gap = (Math.abs(100 * SCALE - stated) / SCALE).toFixed(2);
  const direction = stated > 100 * SCALE ? 'over' : 'short';

  return `The percentages total ${total}%, they must total 100% — ${gap}% ${direction}.`;
}

/** How {@link splitBlocker} names the paid column. */
export const PAID_SUBJECT: SplitSubject = {
  shares: 'The paid amounts',
  total: 'already paid',
  item: 'paid amount'
};

/**
 * Builds the whole split table: each renter's slice of the fee, of what is already paid, and what
 * that leaves them owing.
 *
 * **Two independent divisions, one rule.** The fee and the already-paid figure are divided by the same
 * {@link divideEvenly} — money, to the cent, leftover cents one each to the first rows — and each has
 * its own typed rows, so fixing what one renter owes does not disturb what another has paid.
 *
 * @param tenants The renters the split covers, in roster order.
 * @param feeTotal The fee being divided.
 * @param alreadyPaid The charge's already-paid figure, divided the same way.
 * @param amountOverrides Rows whose fee share the owner typed.
 * @param paidOverrides Rows whose paid amount the owner typed.
 * @param unit The unit the **fee** column is typed in. The paid column is always money — there is no
 *   `alreadyPaidPercent` on the wire, so it has no unit to choose (requirement 23).
 */
export function buildSplitTable(
  tenants: readonly { tenantId: string; name: string }[],
  feeTotal: number,
  alreadyPaid: number,
  amountOverrides: ReadonlyMap<string, TenantShareOverride>,
  paidOverrides: ReadonlyMap<string, TenantShareOverride>,
  unit: ShareUnit = 'amount'
): SplitTableRow[] {
  const feeRows = buildSplitRows(tenants, feeTotal, amountOverrides, unit);
  const paidRows = buildSplitRows(tenants, alreadyPaid, paidOverrides, 'amount');

  return feeRows.map((row, index) => {
    const paid = paidRows[index];

    return {
      ...row,
      paidAmount: paid.amount,
      paidText: paid.text,
      paidAuthored: paid.authoredUnit !== 'even',
      paidError: paid.error,
      // Negative when a renter has paid more of the fee than they owe of it. Shown rather than
      // clamped, and not refused here: the charge itself allows `alreadyPaid` to exceed its own
      // total, so a stricter rule per renter would be one this screen invented.
      owes: Math.round((row.amount - paid.amount) * 100) / 100
    };
  });
}

/**
 * Projects the split onto the wire (requirement 20).
 *
 * **A fee shared by everybody sends nothing at all**, not an empty array: both read the same on the
 * server, but omission says *not specified* where `[]` says *specified as nobody*.
 *
 * **`sharePercent` rides on every row or on none, decided by the split's unit** — v11's correction,
 * and the reason this function had a defect rather than a preference. v7 attached it per row, to the
 * rows the owner had typed as percentages. The service sums the percentages a request *states* and
 * requires exactly `100.00`, so a two-renter fee with one row switched to `%` stated a single `70`
 * and was refused `422`, while the page showed `210.00 / 90.00` against a `$300` fee and enabled
 * Save. Nothing in a per-row unit can produce a stated set totalling a hundred except by accident.
 *
 * **A typed row sends what was typed**, not {@link TenantShareRow.sharePercent}, which is derived
 * back from the rounded cents: `33.334` typed re-derives as `33.33`, and three of those total
 * `99.99`. A row nobody typed has no such figure and sends the derived one, which is the honest
 * value for a share the page worked out itself.
 *
 * @param rows The split as {@link buildSplitTable} produced it.
 * @param unit The unit the split is typed in.
 * @returns The `tenantShares` array, or `undefined` when the fee is shared by every renter.
 */
export function toTenantShareInputs(
  rows: readonly SplitTableRow[],
  unit: ShareUnit = 'amount'
): TenantShareInput[] | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  return rows.map((row) => ({
    tenantId: row.tenantId,
    amount: row.amount,
    ...(unit === 'percent' ? { sharePercent: statedPercent(row) } : {}),
    alreadyPaid: row.paidAmount
  }));
}
