import { BaseApiClient } from './api_client.js';
import type { FxRate } from '../types/domain.js';

/** The Frankfurter latest-rates response shape. */
type FrankfurterResponse = {
	base: string;
	rates: Record<string, number>;
};

/** Reads currency rates from Frankfurter (`api.frankfurter.app`). */
export class FxClient extends BaseApiClient {
	override source(): string {
		return 'api.frankfurter.app';
	}

	/** The latest EUR→USD rate. */
	async latest(): Promise<FxRate> {
		const raw = await this.receive<FrankfurterResponse>(
			fetch('https://api.frankfurter.app/latest?from=EUR&to=USD'),
		);
		return {
			base: raw.base,
			quote: 'USD',
			rate: raw.rates.USD,
		};
	}
}
