import {
  TenantShareOverride,
  buildSplitRows,
  divideEvenly,
  readTypedShare,
  splitBlocker,
  toTenantShareInputs
} from './tenant-split.util';

/**
 * The split's arithmetic, tested where it lives.
 *
 * These assertions used to sit on `AddAdditionalChargeComponent`, which was the only screen that could
 * say who pays. They moved with the logic when the Invoices page needed the same editor: the rules are
 * the part that must not differ between the two, so they are pinned once, here, rather than per screen.
 */
describe('tenant-split.util', () => {
  const alice = { tenantId: '11111111-1111-1111-1111-111111111111', name: 'Alice Adams' };
  const bob = { tenantId: '22222222-2222-2222-2222-222222222222', name: 'Bob Brown' };
  const carol = { tenantId: '33333333-3333-3333-3333-333333333333', name: 'Carol Clark' };
  const dave = { tenantId: '44444444-4444-4444-4444-444444444444', name: 'Dave Davis' };
  const erin = { tenantId: '55555555-5555-5555-5555-555555555555', name: 'Erin Evans' };
  const frank = { tenantId: '66666666-6666-6666-6666-666666666666', name: 'Frank Ford' };

  /** The typed-row map, written the way a caller builds it. */
  function typed(...entries: [string, TenantShareOverride][]): Map<string, TenantShareOverride> {
    return new Map(entries);
  }

  /** Sums a split the way the wire does — in cents, so the assertion is exact rather than close. */
  function totalCents(rows: readonly { amount: number }[]): number {
    return rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  }

  describe('divideEvenly (FR 17)', () => {
    it('divides $300 across three renters as 100.00 each', () => {
      // The case that separates dividing the money from dividing the percentage: 100/3 = 33.33%, and
      // multiplying that back across three rows gives 99.99 / 99.99 / 100.02.
      expect(divideEvenly(300, 3)).toEqual([100, 100, 100]);
    });

    it('gives the odd cent to the first row on a three-way $100', () => {
      expect(divideEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
    });

    it('spreads four leftover cents one each across six renters', () => {
      // An implementation that stacks the whole remainder on one row passes the tests above and fails
      // here — it would over-bill the first renter by three cents.
      expect(divideEvenly(100, 6)).toEqual([16.67, 16.67, 16.67, 16.67, 16.66, 16.66]);
      expect(totalCents(divideEvenly(100, 6).map((amount) => ({ amount })))).toBe(10000);
    });

    it('divides a clean two-way split with no remainder at all', () => {
      expect(divideEvenly(100, 2)).toEqual([50, 50]);
    });

    it('returns nothing to divide between nobody', () => {
      expect(divideEvenly(300, 0)).toEqual([]);
      expect(divideEvenly(300, -1)).toEqual([]);
    });

    it('floors a negative total at zero rather than handing out debts', () => {
      expect(divideEvenly(-50, 2)).toEqual([0, 0]);
    });
  });

  describe('readTypedShare (FR 18)', () => {
    it('reads an amount as cents', () => {
      expect(readTypedShare('120.45', 'amount', 30000)).toEqual({ cents: 12045, error: null });
    });

    it('takes a percentage of the fee, to the cent', () => {
      // 66.67% of $300 is 200.01, not 200.00 — which is why the typed unit is recorded, not derived.
      expect(readTypedShare('66.67', 'percent', 30000)).toEqual({ cents: 20001, error: null });
    });

    it('treats an empty box as zero without complaining', () => {
      // Clearing a cell to retype it is the ordinary way to change one, and a message that appears
      // between two keystrokes teaches nobody anything.
      expect(readTypedShare('', 'amount', 30000)).toEqual({ cents: 0, error: null });
      expect(readTypedShare('   ', 'amount', 30000)).toEqual({ cents: 0, error: null });
    });

    it('reports text it cannot read, and text below zero', () => {
      expect(readTypedShare('12,50', 'amount', 30000).error).toBe('Enter a number.');
      expect(readTypedShare('one hundred', 'amount', 30000).error).toBe('Enter a number.');
      expect(readTypedShare('-40', 'amount', 30000).error).toBe('A share cannot be negative.');
    });
  });

  describe('buildSplitRows (FR 17 and 18)', () => {
    it('divides evenly when nothing has been typed', () => {
      const rows = buildSplitRows([alice, bob, carol], 300, typed());

      expect(rows.map((row) => row.amount)).toEqual([100, 100, 100]);
      expect(rows.map((row) => row.sharePercent)).toEqual([33.33, 33.33, 33.33]);
      expect(rows.every((row) => row.authoredUnit === 'even')).toBeTrue();
      expect(rows.some((row) => row.carriesLeftoverCent)).toBeFalse();
    });

    it('marks the rows a leftover cent landed on', () => {
      const rows = buildSplitRows([alice, bob, carol, dave, erin, frank], 100, typed());

      expect(rows.map((row) => row.carriesLeftoverCent)).toEqual([
        true, true, true, true, false, false
      ]);
    });

    it('leaves a typed amount alone and derives its percentage', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed([alice.tenantId, { unit: 'amount', text: '120' }])
      );

      expect(rows[0].authoredUnit).toBe('amount');
      expect(rows[0].amount).toBe(120);
      expect(rows[0].sharePercent).toBe(40);
      expect(rows[0].text).withContext('the owner is echoed back verbatim').toBe('120');

      // The untouched rows share what is left of the fee.
      expect(rows[1].amount).toBe(90);
      expect(rows[2].amount).toBe(90);
      expect(totalCents(rows)).toBe(30000);
    });

    it('derives the amount from a typed percentage, to the cent', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed([alice.tenantId, { unit: 'percent', text: '66.67' }])
      );

      expect(rows[0].authoredUnit).toBe('percent');
      expect(rows[0].sharePercent).toBe(66.67);
      expect(rows[0].amount).toBe(200.01);

      // The remaining $99.99 divides across the untouched rows, odd cent to the first of them.
      expect(rows[1].amount).toBe(50);
      expect(rows[2].amount).toBe(49.99);
      expect(totalCents(rows)).toBe(30000);
    });

    it('re-divides only the untouched rows when the roster grows', () => {
      const overrides = typed([alice.tenantId, { unit: 'amount', text: '200' }]);

      expect(buildSplitRows([alice, bob], 300, overrides).map((row) => row.amount)).toEqual([200, 100]);

      // An owner who has fixed one number does not expect it undone because they ticked somebody else.
      expect(buildSplitRows([alice, bob, carol], 300, overrides).map((row) => row.amount)).toEqual([
        200, 50, 50
      ]);
    });

    it('floors the untouched neighbours of an over-typed row at zero, not below it', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed([alice.tenantId, { unit: 'amount', text: '400' }])
      );

      // A row reading -$50.00 would answer a question nobody asked. The excess turns up in the
      // blocker instead, which is where an owner can act on it.
      expect(rows.map((row) => row.amount)).toEqual([400, 0, 0]);
    });

    it('keeps unreadable text on the row it was typed into', () => {
      const rows = buildSplitRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { unit: 'amount', text: '12,50' }])
      );

      expect(rows[0].error).toBe('Enter a number.');
      expect(rows[0].text).toBe('12,50');
      expect(rows[0].amount).toBe(0);
    });

    it('has nothing to divide without renters, or without a fee', () => {
      // Two complete states rather than errors: an empty selection means every renter shares the fee,
      // and a fee with no total is simply not authored yet.
      expect(buildSplitRows([], 300, typed())).toEqual([]);
      expect(buildSplitRows([alice, bob], 0, typed())).toEqual([]);
    });
  });

  describe('splitBlocker (FR 19)', () => {
    it('names both figures and the gap when the shares fall short', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed(
          [alice.tenantId, { unit: 'amount', text: '100' }],
          [bob.tenantId, { unit: 'amount', text: '100' }],
          [carol.tenantId, { unit: 'amount', text: '90' }]
        )
      );

      expect(splitBlocker(rows, 300)).toBe(
        'The shares total $290.00, the fee is $300.00 — $10.00 short.'
      );
    });

    it('says so in the other direction when they come to more than the fee', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed([alice.tenantId, { unit: 'amount', text: '400' }])
      );

      expect(splitBlocker(rows, 300)).toBe(
        'The shares total $400.00, the fee is $300.00 — $100.00 over.'
      );
    });

    it('refuses a row it cannot read, whatever the rest add up to', () => {
      const one = buildSplitRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { unit: 'amount', text: 'lots' }])
      );
      expect(splitBlocker(one, 300)).toBe('One share cannot be read. Correct it to save this fee.');

      const two = buildSplitRows(
        [alice, bob],
        300,
        typed(
          [alice.tenantId, { unit: 'amount', text: 'lots' }],
          [bob.tenantId, { unit: 'amount', text: '-5' }]
        )
      );
      expect(splitBlocker(two, 300)).toBe('2 shares cannot be read. Correct them to save this fee.');
    });

    it('allows an untouched even split, leftover cent and all', () => {
      // 33.34 / 33.33 / 33.33 totals $100.00 exactly, which is the whole point of dividing the money
      // in cents. A split assembled from 33.33 three times would be refused by its own page.
      expect(splitBlocker(buildSplitRows([alice, bob, carol], 100, typed()), 100)).toBeNull();
    });

    it('allows a typed split that totals exactly', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed(
          [alice.tenantId, { unit: 'amount', text: '200' }],
          [bob.tenantId, { unit: 'amount', text: '50' }],
          [carol.tenantId, { unit: 'amount', text: '50' }]
        )
      );

      expect(splitBlocker(rows, 300)).toBeNull();
    });

    it('has nothing to refuse when the fee is shared by everyone', () => {
      expect(splitBlocker([], 300)).toBeNull();
    });
  });

  describe('toTenantShareInputs (FR 20)', () => {
    it('sends nothing at all for a fee shared by everyone', () => {
      // Absent rather than empty: both read the same server-side, but omission says "not specified"
      // where [] says "specified as nobody".
      expect(toTenantShareInputs([])).toBeUndefined();
    });

    it('omits sharePercent on a row the owner typed as an amount', () => {
      const [share] = toTenantShareInputs(
        buildSplitRows([alice], 300, typed([alice.tenantId, { unit: 'amount', text: '300' }]))
      )!;

      expect(share).toEqual({ tenantId: alice.tenantId, amount: 300 });
      // Asserted on the property being absent, not null — the absence is what records the typed unit.
      expect('sharePercent' in share).toBeFalse();
    });

    it('sends sharePercent on a row the owner typed as a percentage', () => {
      const [share] = toTenantShareInputs(
        buildSplitRows([alice], 300, typed([alice.tenantId, { unit: 'percent', text: '100' }]))
      )!;

      expect(share).toEqual({ tenantId: alice.tenantId, amount: 300, sharePercent: 100 });
    });

    it('omits sharePercent on an evenly divided row, which nobody typed either way', () => {
      const shares = toTenantShareInputs(buildSplitRows([alice, bob], 300, typed()))!;

      expect(shares.every((share) => !('sharePercent' in share))).toBeTrue();
      expect(shares.map((share) => share.amount)).toEqual([150, 150]);
    });

    it('sends amounts that total the fee, across several totals and renter counts', () => {
      const roster = [alice, bob, carol, dave, erin, frank];

      for (const total of [100, 300, 0.03, 1234.56, 999.99]) {
        for (const count of [1, 2, 3, 5, 6]) {
          const shares = toTenantShareInputs(buildSplitRows(roster.slice(0, count), total, typed()))!;
          expect(totalCents(shares))
            .withContext(`$${total} across ${count}`)
            .toBe(Math.round(total * 100));
        }
      }
    });
  });
});
