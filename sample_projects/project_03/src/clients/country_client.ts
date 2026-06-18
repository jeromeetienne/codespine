import { BaseApiClient } from './api_client.js';
import type { Country } from '../types/domain.js';

/** The subset of a REST Countries record we read. */
type RestCountryRecord = {
	name: { common: string };
	capital: string[];
	currencies: Record<string, { name: string }>;
	population: number;
};

/** Reads country profiles from REST Countries (`restcountries.com`). */
export class CountryClient extends BaseApiClient {
	override source(): string {
		return 'restcountries.com';
	}

	/** The country profile for the demo destination (France). */
	async lookup(): Promise<Country> {
		const records = await this.receive<RestCountryRecord[]>(
			fetch('https://restcountries.com/v3.1/alpha/fr?fields=name,capital,currencies,population'),
		);
		const record = records[0];
		return {
			name: record.name.common,
			capital: record.capital[0],
			currency: Object.keys(record.currencies)[0],
			population: record.population,
		};
	}
}
