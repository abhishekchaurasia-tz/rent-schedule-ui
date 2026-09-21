import {
  PAID_SUBJECT,
  ShareUnit,
  percentageBlocker,
  TenantShareOverride,
  buildSplitRows,
  buildSplitTable,
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

  /** {@link buildSplitTable} with no typed paid amounts, which is most of these cases. */
  function table(
    tenants: readonly { tenantId: string; name: string }[],
    feeTotal: number,
    alreadyPaid: number,
    amountOverrides: Map<string, TenantShareOverride>,
    paidOverrides: Map<string, TenantShareOverride> = new Map(),
    unit: ShareUnit = 'amount'
  ) {
    return buildSplitTable(tenants, feeTotal, alreadyPaid, amountOverrides, paidOverrides, unit);
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
      // v11: the percentages are divided by the same residue rule as the money, to the six places
      // numeric(9,6) stores. Rounding each one on its own gave 33.33 three times -- 99.99, which the
      // service refuses -- and it is the same arithmetic that moved a cent when the unit changed,
      // because 33.33% of 300 is 99.99 and not 100.00.
      expect(rows.map((row) => row.sharePercent)).toEqual([33.333334, 33.333333, 33.333333]);
      expect(rows.reduce((sum, row) => sum + row.sharePercent, 0)).toBe(100);
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
        typed([alice.tenantId, { text: '120' }])
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
        typed([alice.tenantId, { text: '66.67' }]),
        'percent'
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
      const overrides = typed([alice.tenantId, { text: '200' }]);

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
        typed([alice.tenantId, { text: '400' }])
      );

      // A row reading -$50.00 would answer a question nobody asked. The excess turns up in the
      // blocker instead, which is where an owner can act on it.
      expect(rows.map((row) => row.amount)).toEqual([400, 0, 0]);
    });

    it('keeps unreadable text on the row it was typed into', () => {
      const rows = buildSplitRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { text: '12,50' }])
      );

      expect(rows[0].error).toBe('Enter a number.');
      expect(rows[0].text).toBe('12,50');
      expect(rows[0].amount).toBe(0);
    });

    it('has nothing to divide between nobody', () => {
      // A complete state rather than an error: an empty selection means every renter shares the fee.
      expect(buildSplitRows([], 300, typed())).toEqual([]);
    });

    it('divides a total of zero into a row of zero each', () => {
      // Not the absence of a split. The paid column divides the charge's `alreadyPaid`, which is
      // usually nothing, and every renter having paid $0.00 of it is the honest reading.
      const rows = buildSplitRows([alice, bob], 0, typed());

      expect(rows.map((row) => row.amount)).toEqual([0, 0]);
      expect(rows.map((row) => row.sharePercent))
        .withContext('dividing by a zero total produced NaN')
        .toEqual([0, 0]);
    });
  });

  describe('splitBlocker (FR 19)', () => {
    it('names both figures and the gap when the shares fall short', () => {
      const rows = buildSplitRows(
        [alice, bob, carol],
        300,
        typed(
          [alice.tenantId, { text: '100' }],
          [bob.tenantId, { text: '100' }],
          [carol.tenantId, { text: '90' }]
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
        typed([alice.tenantId, { text: '400' }])
      );

      expect(splitBlocker(rows, 300)).toBe(
        'The shares total $400.00, the fee is $300.00 — $100.00 over.'
      );
    });

    it('refuses a row it cannot read, whatever the rest add up to', () => {
      const one = buildSplitRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { text: 'lots' }])
      );
      expect(splitBlocker(one, 300)).toBe('One share cannot be read. Correct it to save this fee.');

      const two = buildSplitRows(
        [alice, bob],
        300,
        typed(
          [alice.tenantId, { text: 'lots' }],
          [bob.tenantId, { text: '-5' }]
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
          [alice.tenantId, { text: '200' }],
          [bob.tenantId, { text: '50' }],
          [carol.tenantId, { text: '50' }]
        )
      );

      expect(splitBlocker(rows, 300)).toBeNull();
    });

    it('has nothing to refuse when the fee is shared by everyone', () => {
      expect(splitBlocker([], 300)).toBeNull();
    });
  });

  describe('percentageBlocker (FR 19, v11)', () => {
    /** The fee rows of a percentage split, which is all this guard reads. */
    function percentRows(
      tenants: readonly { tenantId: string; name: string }[],
      feeTotal: number,
      overrides: Map<string, TenantShareOverride>
    ) {
      return table(tenants, feeTotal, 0, overrides, new Map(), 'percent');
    }

    it('has nothing to check on a money split', () => {
      expect(
        percentageBlocker(table([alice, bob], 300, 0, typed([alice.tenantId, { text: '210' }])), 'amount')
      ).toBeNull();
    });

    it('has nothing to refuse when the fee is shared by everyone', () => {
      expect(percentageBlocker([], 'percent')).toBeNull();
    });

    it('accepts percentages that total exactly a hundred', () => {
      const rows = percentRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { text: '70' }], [bob.tenantId, { text: '30' }])
      );

      expect(percentageBlocker(rows, 'percent')).toBeNull();
    });

    it('refuses percentages that total less, naming the total and the gap', () => {
      const rows = percentRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { text: '60' }], [bob.tenantId, { text: '30' }])
      );

      expect(percentageBlocker(rows, 'percent'))
        .toBe('The percentages total 90.00%, they must total 100% — 10.00% short.');
    });

    it('refuses percentages that total more', () => {
      const rows = percentRows(
        [alice, bob],
        300,
        typed([alice.tenantId, { text: '70' }], [bob.tenantId, { text: '40' }])
      );

      expect(percentageBlocker(rows, 'percent'))
        .toBe('The percentages total 110.00%, they must total 100% — 10.00% over.');
    });

    it('refuses a truncated third even though every amount is exact', () => {
      // 33.33 % of 300 is 99.99 three times, so the amounts are $0.03 short and the money arm speaks
      // first. Here the third row carries the residue, so the amounts total $300 exactly and this is
      // the only arm left to catch the 99.99 % -- which is the whole reason it exists.
      const rows = percentRows(
        [alice, bob, carol],
        300,
        typed(
          [alice.tenantId, { text: '33.33' }],
          [bob.tenantId, { text: '33.33' }],
          [carol.tenantId, { text: '33.33' }]
        )
      );

      expect(splitBlocker(rows, 300)).withContext('the amounts are what is short here').not.toBeNull();
      expect(percentageBlocker(rows, 'percent'))
        .toBe('The percentages total 99.99%, they must total 100% — 0.01% short.');
    });

    it('accepts a third typed past two decimal places, which sums to a hundred exactly', () => {
      // 33.334 + 33.333 + 33.333 is 100.000. Summing in hundredths would round each to 33.33 and
      // refuse a split the service accepts; summing in binary floating point would land just past
      // 100 and refuse it too.
      const rows = percentRows(
        [alice, bob, carol],
        300,
        typed(
          [alice.tenantId, { text: '33.334' }],
          [bob.tenantId, { text: '33.333' }],
          [carol.tenantId, { text: '33.333' }]
        )
      );

      expect(splitBlocker(rows, 300)).withContext('the amounts are exact').toBeNull();
      expect(percentageBlocker(rows, 'percent')).toBeNull();
    });

    it('counts the derived percentage of a row nobody typed, because that is what is sent', () => {
      const rows = percentRows([alice, bob], 300, typed([alice.tenantId, { text: '70' }]));

      // Bob was never typed; his 30 % goes on the wire all the same, so the guard has to see it.
      expect(percentageBlocker(rows, 'percent')).toBeNull();
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
        table([alice], 300, 0, typed([alice.tenantId, { text: '300' }]))
      )!;

      expect(share).toEqual({ tenantId: alice.tenantId, amount: 300, alreadyPaid: 0 });
      // Asserted on the property being absent, not null — the absence is what records the typed unit.
      expect('sharePercent' in share).toBeFalse();
    });

    it('sends sharePercent on a row the owner typed as a percentage', () => {
      const [share] = toTenantShareInputs(
        table([alice], 300, 0, typed([alice.tenantId, { text: '100' }]), new Map(), 'percent'),
        'percent'
      )!;

      expect(share).toEqual({
        tenantId: alice.tenantId,
        amount: 300,
        sharePercent: 100,
        alreadyPaid: 0
      });
    });

    // --- v11: the unit belongs to the split -----------------------------------
    //
    // Every case below uses TWO renters, deliberately. The only percentage test this file had used
    // one renter at 100 %, which is the single value that cannot fail the service's total-one-hundred
    // rule -- so the defect these cover shipped under a green suite.

    it('sends sharePercent on every row of a percentage split, not only the typed ones', () => {
      // The defect, stated as a test. Alice is typed at 70 % and Bob divides the rest; before v11 only
      // Alice carried a percentage, the service summed the stated ones to 70, and the save was
      // refused 422 from a screen showing 210.00 / 90.00 against a $300 fee.
      const shares = toTenantShareInputs(
        table([alice, bob], 300, 0, typed([alice.tenantId, { text: '70' }]), new Map(), 'percent'),
        'percent'
      )!;

      expect(shares.map((share) => share.sharePercent)).toEqual([70, 30]);
      expect(shares.map((share) => share.amount)).toEqual([210, 90]);
    });

    it('sends sharePercent on no row of a money split, including the rows the owner typed', () => {
      const shares = toTenantShareInputs(
        table([alice, bob], 300, 0, typed([alice.tenantId, { text: '210' }]))
      )!;

      expect(shares.every((share) => !('sharePercent' in share))).toBeTrue();
      expect(shares.map((share) => share.amount)).toEqual([210, 90]);
    });

    it('sends the percentage the owner typed, not one re-derived from the rounded amount', () => {
      // 33.334 % of 300 rounds to 100.00, and 100.00 of 300 derives back to 33.33. Sending the
      // derived figure would turn a split the owner made total 100.000 into three 33.33s totalling
      // 99.99 -- the service's refusal, for a number nobody entered.
      const shares = toTenantShareInputs(
        table(
          [alice, bob, carol],
          300,
          0,
          typed(
            [alice.tenantId, { text: '33.334' }],
            [bob.tenantId, { text: '33.333' }],
            [carol.tenantId, { text: '33.333' }]
          ),
          new Map(),
          'percent'
        ),
        'percent'
      )!;

      expect(shares.map((share) => share.sharePercent)).toEqual([33.334, 33.333, 33.333]);
      // The derived figures, which is what used to go: three 33.33s.
      expect(shares.map((share) => share.amount)).toEqual([100, 100, 100]);
    });

    it('reads every typed row in the unit the split is set to, not one number meaning two things', () => {
      // 70 typed in a percentage split is 70 % of the fee on both rows, never $70 on one of them.
      const rows = table(
        [alice, bob],
        300,
        0,
        typed([alice.tenantId, { text: '70' }], [bob.tenantId, { text: '30' }]),
        new Map(),
        'percent'
      );

      expect(rows.map((row) => row.amount)).toEqual([210, 90]);
    });

    it('omits sharePercent on an evenly divided row, which nobody typed either way', () => {
      const shares = toTenantShareInputs(table([alice, bob], 300, 0, typed()))!;

      expect(shares.every((share) => !('sharePercent' in share))).toBeTrue();
      expect(shares.map((share) => share.amount)).toEqual([150, 150]);
    });

    it('always carries alreadyPaid, so the server has no division left to make', () => {
      // The charge carries one already-paid figure, and a server left to divide it could divide it
      // differently — the hazard requirement 17 exists for, one split shown and another stored.
      const shares = toTenantShareInputs(table([alice, bob, carol], 300, 100, typed()))!;

      expect(shares.map((share) => share.alreadyPaid)).toEqual([33.34, 33.33, 33.33]);
      expect(shares.every((share) => 'alreadyPaid' in share)).toBeTrue();
    });

    it('sends amounts that total the fee, across several totals and renter counts', () => {
      const roster = [alice, bob, carol, dave, erin, frank];

      for (const total of [100, 300, 0.03, 1234.56, 999.99]) {
        for (const count of [1, 2, 3, 5, 6]) {
          const shares = toTenantShareInputs(table(roster.slice(0, count), total, 0, typed()))!;
          expect(totalCents(shares))
            .withContext(`$${total} across ${count}`)
            .toBe(Math.round(total * 100));
        }
      }
    });
  });
  describe('buildSplitTable — the paid column', () => {
    it('divides what is already paid by the same rule as the fee', () => {
      const rows = table([alice, bob, carol], 300, 100, typed());

      expect(rows.map((row) => row.amount)).toEqual([100, 100, 100]);
      // $100 across three is 33.34 / 33.33 / 33.33 — the odd cent to the first row, as for the fee.
      expect(rows.map((row) => row.paidAmount)).toEqual([33.34, 33.33, 33.33]);
      expect(rows.map((row) => row.owes)).toEqual([66.66, 66.67, 66.67]);
    });

    it('leaves a typed paid amount alone and lets the untouched rows absorb the rest', () => {
      const rows = table(
        [alice, bob, carol],
        300,
        150,
        typed(),
        typed([alice.tenantId, { text: '100' }])
      );

      // Saying one renter has paid $100 of $150 leaves $50 to the others, not a fresh three-way split.
      expect(rows.map((row) => row.paidAmount)).toEqual([100, 25, 25]);
      expect(rows[0].paidAuthored).toBeTrue();
      expect(rows[1].paidAuthored).toBeFalse();
      expect(rows.map((row) => row.owes)).toEqual([0, 75, 75]);
    });

    it('keeps the two columns independent', () => {
      const rows = table(
        [alice, bob],
        300,
        100,
        typed([alice.tenantId, { text: '200' }]),
        typed([bob.tenantId, { text: '80' }])
      );

      // Fixing what Alice owes must not disturb what Bob has paid, and the reverse.
      expect(rows.map((row) => row.amount)).toEqual([200, 100]);
      expect(rows.map((row) => row.paidAmount)).toEqual([20, 80]);
      expect(rows.map((row) => row.owes)).toEqual([180, 20]);
    });

    it('shows a negative Owes rather than clamping an overpaid renter', () => {
      const rows = table(
        [alice, bob],
        300,
        400,
        typed(),
        typed([alice.tenantId, { text: '300' }])
      );

      // The charge itself lets alreadyPaid exceed its own total, so refusing it per renter would be a
      // rule this screen invented. It is shown, and the totals row says the paid column is over.
      expect(rows[0].owes).toBe(-150);
    });

    it('reports a paid box it cannot read, separately from the amount box', () => {
      const rows = table(
        [alice, bob],
        300,
        100,
        typed(),
        typed([alice.tenantId, { text: 'half' }])
      );

      expect(rows[0].paidError).toBe('Enter a number.');
      expect(rows[0].error).withContext('the amount box was blamed too').toBeNull();
      expect(rows[0].paidText).toBe('half');
    });

    it('names the paid column when it is the one that does not add up', () => {
      const rows = table(
        [alice, bob],
        300,
        100,
        typed(),
        typed(
          [alice.tenantId, { text: '10' }],
          [bob.tenantId, { text: '10' }]
        )
      );

      const paidRows = rows.map((row) => ({ ...row, amount: row.paidAmount, error: row.paidError }));

      expect(splitBlocker(paidRows, 100, PAID_SUBJECT)).toBe(
        'The paid amounts total $20.00, already paid is $100.00 — $80.00 short.'
      );
      // The fee column is fine, so it must not be the one reported.
      expect(splitBlocker(rows, 300)).toBeNull();
    });
  });
});
