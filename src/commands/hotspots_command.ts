import chalk from 'chalk';
import { Command } from 'commander';
import { HotspotMetric, HotspotReport } from '../query/graph_query.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers, QueryOptions } from './command_helpers.js';

type HotspotsOptions = QueryOptions & {
	by?: string;
	limit: string;
	measuredOnly?: boolean;
};

const METRICS: HotspotMetric[] = ['self-time', 'samples', 'callers', 'call-count', 'blast-radius'];

export class HotspotsCommand {
	static register(program: Command): void {
		const command = program
			.command('hotspots')
			.description('rank nodes by optimization leverage (runtime self-time, fan-in, call-count, or blast radius)');
		CommandHelpers.addOutputFolderOption(command)
			.option('--by <metric>', `ranking metric: ${METRICS.join(', ')} (default: self-time when enriched, else callers)`)
			.option('--limit <n>', 'maximum number of hotspots to return', '20')
			.option('--measured-only', 'restrict ranking to nodes that carry runtime metrics', false)
			.option('--json', 'emit raw JSON', false)
			.action(async (options: HotspotsOptions) => {
				if (options.by !== undefined && METRICS.includes(options.by as HotspotMetric) === false) {
					console.error(chalk.red(`unknown metric '${options.by}' — choose one of: ${METRICS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					const report = await query.hotspots({
						by: options.by as HotspotMetric | undefined,
						limit: Number(options.limit),
						measuredOnly: options.measuredOnly === true,
					});
					HotspotsCommand.print(report, options.json === true);
				});
			});
	}

	private static print(report: HotspotReport, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		if (report.fellBack === true) {
			console.log(chalk.yellow('! no runtime data in graph — run `enrich` first. Ranking by `callers` (static fan-in) instead.'));
		}
		const scope = report.measuredOnly === true ? chalk.gray(' (measured nodes only)') : '';
		console.log(chalk.bold(`Hotspots by ${report.metric}`) + scope);
		if (report.hotspots.length === 0) {
			console.log(chalk.yellow('(no results)'));
			return;
		}
		report.hotspots.forEach((hotspot, index) => {
			const rank = chalk.gray(`${String(index + 1).padStart(2)}.`);
			const score = chalk.cyan(HotspotsCommand.formatScore(report.metric, hotspot.score).padStart(14));
			console.log(`${rank} ${score}  ${chalk.gray(hotspot.kind.padEnd(10))} ${chalk.bold(hotspot.name)}  ${chalk.gray(`${hotspot.filePath}:${hotspot.startLine}`)}`);
		});
		console.log(chalk.gray(`\n${report.hotspots.length} hotspot(s)`));
	}

	private static formatScore(metric: HotspotMetric, score: number): string {
		if (metric === 'self-time') {
			return `${score} ms`;
		}
		if (metric === 'samples') {
			return `${score} samples`;
		}
		if (metric === 'callers') {
			return `${score} callers`;
		}
		if (metric === 'call-count') {
			return `${score} calls`;
		}
		return `${score} impacted`;
	}
}
