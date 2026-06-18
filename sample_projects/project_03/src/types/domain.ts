/** Current weather at a location. */
export type Weather = {
	temperatureC: number;
	windKph: number;
};

/** A country profile. */
export type Country = {
	name: string;
	capital: string;
	region: string;
	incomeLevel: string;
};

/** A foreign-exchange rate between two currencies. */
export type FxRate = {
	base: string;
	quote: string;
	rate: number;
};

/** The aggregated brief for one destination. */
export type TripBrief = {
	destination: string;
	country: Country;
	weather: Weather;
	fx: FxRate;
};
