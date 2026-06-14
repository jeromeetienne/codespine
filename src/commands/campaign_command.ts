import chalk from 'chalk';
import { Command } from 'commander';
import { CampaignItem, CampaignPlanner, CampaignReadiness, CampaignReport } from '../query/campaign_planner.js';
import { HotspotMetric } from '../query/graph_query.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers, QueryOptions } from './command_helpers.js';

type CampaignCommandOptions = QueryOptions & {
	by?: string;
	limit: string;
	maxBlast: string;
};

const METRICS: HotspotMetric[] = ['self-time', 'samples', 'callers', 'call-count', 'blast-radius'];

const READINESS_ORDER: CampaignReadiness[] = ['auto-applicable', 'needs-workload', 'manual'];

export class CampaignCommand {
	static register(program: Command): void {
		const command = program
			.command('campaign')
			.description('rank a de-risked optimization worklist: safe dead-code removals plus hotspots, tagged by executor-readiness');
		CommandHelpers.addOutputFolderOption(command)
			.option('--by <metric>', `hotspot ranking metric: ${METRICS.join(', ')} (default: self-time when enriched, else callers)`)
			.option('--limit <n>', 'maximum number of worklist items to return', '20')
			.option('--max-blast <n>', 'blast-radius ceiling; a hotspot above it is tagged manual', '25')
			.option('--json', 'emit raw JSON', false)
			.action(async (options: CampaignCommandOptions) => {
				if (options.by !== undefined && METRICS.includes(options.by as HotspotMetric) === false) {
					console.error(chalk.red(`unknown metric '${options.by}' — choose one of: ${METRICS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					const report = await CampaignPlanner.plan(query, {
						by: options.by as HotspotMetric | undefined,
						limit: Number(options.limit),
						maxBlastRadius: Number(options.maxBlast),
					});
					CampaignCommand.print(report, options.json === true);
				});
			});
	}

	private static print(report: CampaignReport, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		if (report.fellBack === true) {
			console.log(chalk.yellow('! no runtime data in graph — run `enrich` first. Hotspots ranked by `callers` (static fan-in) instead.'));
		}
		console.log(
			chalk.bold('Optimization campaign')
			+ chalk.gray(` (hotspots by ${report.metric} · manual above blast radius ${report.maxBlastRadius})`),
		);
		if (report.items.length === 0) {
			console.log(chalk.yellow('(no candidates)'));
			return;
		}
		report.items.forEach((item, index) => {
			const rank = chalk.gray(`${String(index + 1).padStart(2)}.`);
			const badge = CampaignCommand.readinessBadge(item.readiness);
			const detail = item.candidate === 'dead-export'
				? chalk.gray('safe removal')
				: chalk.cyan(`${CampaignCommand.round(item.score)} ${item.metric}`) + chalk.gray(` · blast ${item.blastRadius}`);
			console.log(
				`${rank} ${badge}  ${chalk.gray(item.kind.padEnd(9))} ${chalk.bold(item.name)}  ${detail}  ${chalk.gray(`${item.filePath}:${item.startLine}`)}`,
			);
		});
		console.log(chalk.gray(`\n${report.items.length} item(s) — ${CampaignCommand.summary(report.items)}`));
	}

	private static readinessBadge(readiness: CampaignReadiness): string {
		const label = readiness.padEnd(15);
		if (readiness === 'auto-applicable') {
			return chalk.green(label);
		}
		if (readiness === 'needs-workload') {
			return chalk.yellow(label);
		}
		return chalk.gray(label);
	}

	private static summary(items: CampaignItem[]): string {
		const counts = new Map<CampaignReadiness, number>();
		for (const item of items) {
			counts.set(item.readiness, (counts.get(item.readiness) ?? 0) + 1);
		}
		return READINESS_ORDER
			.filter((readiness) => counts.has(readiness))
			.map((readiness) => `${counts.get(readiness)} ${readiness}`)
			.join(', ');
	}

	private static round(value: number): number {
		return Math.round(value * 1000) / 1000;
	}
}
