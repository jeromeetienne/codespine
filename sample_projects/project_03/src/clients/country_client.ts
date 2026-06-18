import { BaseApiClient } from './api_client.js';
import type { Country } from '../types/domain.js';

/** The subset of a World Bank country record we read. */
type WorldBankCountryRecord = {
	name: string;
	capitalCity: string;
	region: { value: string };
	incomeLevel: { value: string };
};

/** The World Bank wraps its records in a `[metadata, records]` pair. */
type WorldBankCountryResponse = [unknown, WorldBankCountryRecord[]];

/** Reads country profiles from the World Bank API (`api.worldbank.org`). */
export class CountryClient extends BaseApiClient {
	override source(): string {
		return 'api.worldbank.org';
	}

	/** The country profile for the demo destination (France). */
	async lookup(): Promise<Country> {
		const [, records] = await this.receive<WorldBankCountryResponse>(
			fetch('https://api.worldbank.org/v2/country/FR?format=json'),
		);
		const record = records[0];
		return {
			name: record.name,
			capital: record.capitalCity,
			region: record.region.value,
			incomeLevel: record.incomeLevel.value,
		};
	}
}
