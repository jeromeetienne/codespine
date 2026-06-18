// A repeatable benchmark workload for sample_projects/project_03: it drives the
// multi-API aggregator under load with the upstream calls stubbed offline, so the
// V8 sampler catches the in-project hot frame (`brief`, plus the clients' parse
// paths) without touching the network.
//
// This file lives OUTSIDE the extracted source root so it never becomes a graph
// node. Imports are module-relative (not cwd-relative) so it runs from anywhere:
//
//   npx ts-knowledge-graph benchmark brief \
//     --workload scripts/benchmarks/project_03_workload.ts \
//     -o ./.ts_knowledge_graph/project_03 --root ./sample_projects/project_03
import { BriefService } from '../../sample_projects/project_03/src/brief/brief_service.js';

globalThis.fetch = (async (input: string | URL) => {
	const url = String(input);
	const body = url.includes('open-meteo')
		? { current_weather: { temperature: 14, windspeed: 9 } }
		: url.includes('restcountries')
			? [{ name: { common: 'France' }, capital: ['Paris'], currencies: { EUR: { name: 'Euro' } }, population: 67000000 }]
			: { base: 'EUR', rates: { USD: 1.1 } };
	return { json: async () => body };
}) as unknown as typeof fetch;

let sink = 0;
for (let i = 0; i < 100000; i += 1) {
	const brief = await BriefService.brief();
	sink += brief.country.population + brief.weather.temperatureC + brief.fx.rate;
}
console.log(sink);
