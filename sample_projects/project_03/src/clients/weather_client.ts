import { BaseApiClient } from './api_client.js';
import type { Weather } from '../types/domain.js';

/** The subset of the Open-Meteo current-weather response we read. */
type OpenMeteoResponse = {
	current_weather: {
		temperature: number;
		windspeed: number;
	};
};

/** Reads current weather from Open-Meteo (`api.open-meteo.com`). */
export class WeatherClient extends BaseApiClient {
	override source(): string {
		return 'api.open-meteo.com';
	}

	/** Current weather for the demo destination (Paris). */
	async current(): Promise<Weather> {
		const raw = await this.receive<OpenMeteoResponse>(
			fetch('https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true'),
		);
		return {
			temperatureC: raw.current_weather.temperature,
			windKph: raw.current_weather.windspeed,
		};
	}
}
