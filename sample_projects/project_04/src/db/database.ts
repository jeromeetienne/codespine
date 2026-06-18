import BetterSqlite3 from 'better-sqlite3';
import type { DatabaseSettings } from '../config/settings.js';

/**
 * Mutable counters that make the planted inefficiencies observable without
 * relying on wall-clock time. An optimization is verified by a counter delta
 * (e.g. queries 200 -> 1, rowsRead collapsing once an index is added), which is
 * deterministic, unlike the noisy realism-track timing.
 */
export type QueryCounters = {
	queries: number;
	rowsRead: number;
	prepares: number;
	prepareCacheHits: number;
	prepareCacheMisses: number;
	transactions: number;
};

/** Options for a single statement execution. */
export type ExecOptions = {
	/** Reuse a cached prepared statement for identical SQL instead of re-preparing. */
	cache?: boolean;
};

/**
 * A thin instrumented wrapper around a `better-sqlite3` connection. It is the
 * single execution point for every query, so it can apply the disk-tuning
 * PRAGMAs, count work, and offer an opt-in prepared-statement cache. The class
 * holds connection state, so it uses instance methods.
 */
export class Database {
	private readonly connection: BetterSqlite3.Database;
	private readonly statementCache: Map<string, BetterSqlite3.Statement>;
	private readonly counters: QueryCounters;

	constructor(settings: DatabaseSettings) {
		this.connection = new BetterSqlite3(settings.path);
		this.statementCache = new Map();
		this.counters = {
			queries: 0,
			rowsRead: 0,
			prepares: 0,
			prepareCacheHits: 0,
			prepareCacheMisses: 0,
			transactions: 0,
		};
		this.applyPragmas(settings);
	}

	/** Applies the disk-tuning PRAGMAs (journal mode, fsync policy, page cache). */
	private applyPragmas(settings: DatabaseSettings): void {
		this.connection.pragma(`journal_mode = ${settings.journalMode}`);
		this.connection.pragma(`synchronous = ${settings.synchronous}`);
		this.connection.pragma(`cache_size = ${-Math.abs(settings.cacheSizeKib)}`);
	}

	/** Runs a read and returns every row, counting the query and the rows read. */
	all<T>(sql: string, params: unknown[] = [], options: ExecOptions = {}): T[] {
		const statement = this.statementFor(sql, options);
		this.counters.queries += 1;
		const rows = statement.all(...params) as T[];
		this.counters.rowsRead += rows.length;
		return rows;
	}

	/** Runs a read and returns the first row, or undefined when there is none. */
	get<T>(sql: string, params: unknown[] = [], options: ExecOptions = {}): T | undefined {
		const statement = this.statementFor(sql, options);
		this.counters.queries += 1;
		const row = statement.get(...params) as T | undefined;
		if (row !== undefined) {
			this.counters.rowsRead += 1;
		}
		return row;
	}

	/** Runs a write and returns better-sqlite3's run result (changes, lastInsertRowid). */
	run(sql: string, params: unknown[] = [], options: ExecOptions = {}): BetterSqlite3.RunResult {
		const statement = this.statementFor(sql, options);
		this.counters.queries += 1;
		return statement.run(...params);
	}

	/** Runs `work` inside a single transaction (one fsync for the whole batch). */
	transaction<T>(work: () => T): T {
		const runInTransaction = this.connection.transaction(work);
		this.counters.transactions += 1;
		return runInTransaction();
	}

	/** Executes raw SQL (DDL and multi-statement scripts); used for schema setup. */
	exec(sql: string): void {
		this.connection.exec(sql);
	}

	/** Prepares a statement for setup/seeding without touching the workload counters. */
	prepareRaw(sql: string): BetterSqlite3.Statement {
		return this.connection.prepare(sql);
	}

	/** A copy of the current counters. */
	snapshot(): QueryCounters {
		return { ...this.counters };
	}

	/** Resets the counters to zero (call after seeding to measure only the workload). */
	resetCounters(): void {
		this.counters.queries = 0;
		this.counters.rowsRead = 0;
		this.counters.prepares = 0;
		this.counters.prepareCacheHits = 0;
		this.counters.prepareCacheMisses = 0;
		this.counters.transactions = 0;
	}

	/** Closes the underlying connection. */
	close(): void {
		this.connection.close();
	}

	/** Prepares a statement, optionally reusing a cached instance for identical SQL. */
	private statementFor(sql: string, options: ExecOptions): BetterSqlite3.Statement {
		this.counters.prepares += 1;
		if (options.cache !== true) {
			return this.connection.prepare(sql);
		}
		const cached = this.statementCache.get(sql);
		if (cached !== undefined) {
			this.counters.prepareCacheHits += 1;
			return cached;
		}
		this.counters.prepareCacheMisses += 1;
		const statement = this.connection.prepare(sql);
		this.statementCache.set(sql, statement);
		return statement;
	}
}
