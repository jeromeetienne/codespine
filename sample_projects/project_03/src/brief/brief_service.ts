import { CountryClient } from '../clients/country_client.js';
import { WeatherClient } from '../clients/weather_client.js';
import { FxClient } from '../clients/fx_client.js';
import type { TripBrief } from '../types/domain.js';

/** Aggregates the upstream API clients into a single trip brief. */
export class BriefService {
	/**
	 * Builds the brief for the demo destination.
	 *
	 * Dominant optimisation target (runtime + behavioral). The three upstream calls
	 * are independent, but they are awaited one after another, so their round-trip
	 * latencies add up. Replacing the serial `await`s with `Promise.all` collapses
	 * three sequential round-trips into one. The call graph shows three
	 * `CALLS_EXTERNAL` edges (one per host) rooted here; `enrich` / `hotspots` show
	 * the serialised wall-clock.
	 */
	static async brief(): Promise<TripBrief> {
		const country = await new CountryClient().lookup();
		const weather = await new WeatherClient().current();
		const fx = await new FxClient().latest();
		return { destination: 'Paris', country, weather, fx };
	}
}
