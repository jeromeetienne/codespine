import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BriefService } from '../src/brief/brief_service.js';
import { HttpStats } from '../src/http/http_stats.js';

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

test('brief aggregates all three sources and counts one request each', async () => {
	globalThis.fetch = (async (input: string | URL) => {
		const url = String(input);
		const body = url.includes('open-meteo')
			? { current_weather: { temperature: 14, windspeed: 9 } }
			: url.includes('worldbank')
				? [{ page: 1, pages: 1, per_page: '50', total: 1 }, [{ name: 'France', capitalCity: 'Paris', region: { value: 'Europe & Central Asia' }, incomeLevel: { value: 'High income' } }]]
				: { base: 'EUR', rates: { USD: 1.1 } };
		return { json: async () => body };
	}) as unknown as typeof fetch;

	HttpStats.reset();
	const brief = await BriefService.brief();
	assert.equal(brief.destination, 'Paris');
	assert.equal(brief.country.name, 'France');
	assert.equal(brief.weather.temperatureC, 14);
	assert.equal(brief.fx.rate, 1.1);
	assert.equal(HttpStats.count(), 3);
});
