import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherClient } from '../src/clients/weather_client.js';
import { CountryClient } from '../src/clients/country_client.js';
import { FxClient } from '../src/clients/fx_client.js';

const realFetch = globalThis.fetch;

/** Replace the global fetch with a stub that returns `body` as JSON. */
function stubFetch(body: unknown): void {
	globalThis.fetch = (async () => {
		return { json: async () => body };
	}) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

test('WeatherClient parses the Open-Meteo response', async () => {
	stubFetch({ current_weather: { temperature: 14, windspeed: 9 } });
	const weather = await new WeatherClient().current();
	assert.deepEqual(weather, { temperatureC: 14, windKph: 9 });
	assert.equal(new WeatherClient().source(), 'api.open-meteo.com');
});

test('CountryClient parses the World Bank response', async () => {
	stubFetch([
		{ page: 1, pages: 1, per_page: '50', total: 1 },
		[{ name: 'France', capitalCity: 'Paris', region: { value: 'Europe & Central Asia' }, incomeLevel: { value: 'High income' } }],
	]);
	const country = await new CountryClient().lookup();
	assert.deepEqual(country, { name: 'France', capital: 'Paris', region: 'Europe & Central Asia', incomeLevel: 'High income' });
});

test('FxClient parses the Frankfurter response', async () => {
	stubFetch({ base: 'EUR', rates: { USD: 1.1 } });
	const fx = await new FxClient().latest();
	assert.deepEqual(fx, { base: 'EUR', quote: 'USD', rate: 1.1 });
});
