import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWorkload, DEFAULT_WORKLOAD } from '../scripts/benchmarks/project_04_workload.js';

test('the workload is deterministic: a fixed seed yields an identical report', () => {
	const first = runWorkload(DEFAULT_WORKLOAD);
	const second = runWorkload(DEFAULT_WORKLOAD);
	assert.deepEqual(first, second);
});

test('the workload exhibits the planted inefficiencies via the query counters', () => {
	const report = runWorkload(DEFAULT_WORKLOAD);
	assert.ok(report.calls.createOrder > 0, 'some orders are created');
	// Orders are created but never wrapped in a transaction (planted disk inefficiency).
	assert.equal(report.counters.transactions, 0);
	// getById never reuses a prepared statement (planted CPU/SQL inefficiency).
	assert.equal(report.counters.prepareCacheHits, 0);
	// The list and stats reads pull whole tables into JS, so rowsRead dwarfs the row count.
	assert.ok(report.counters.rowsRead > DEFAULT_WORKLOAD.products);
});
