import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdvancePaymentMonths } from '../controllers/propertyController.js';

test('advance payment validation accepts omitted, blank, and whole months from 0 to 12', () => {
  assert.equal(parseAdvancePaymentMonths(undefined), undefined);
  assert.equal(parseAdvancePaymentMonths(''), null);
  assert.equal(parseAdvancePaymentMonths('0'), 0);
  assert.equal(parseAdvancePaymentMonths('12'), 12);
});

test('advance payment validation rejects values outside the form range', () => {
  for (const value of ['13', '7800', '1.5', '-1', '12 months']) {
    assert.throws(
      () => parseAdvancePaymentMonths(value),
      (error) => error.statusCode === 422 && /0 to 12 months/.test(error.message)
    );
  }
});
