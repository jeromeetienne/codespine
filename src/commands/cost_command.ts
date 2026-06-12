import chalk from 'chalk';
import { Command } from 'commander';
import { CostAttribution, CostFlow, CostMetric, CostReport } from '../query/graph_query.js';
import { CommandHelpers, DEFAULT_DB_PATH, QueryOptions } from './command_helpers.js';

type CostCommandOptions = QueryOptions & {
	by?: string;
	limit: string;
};

const METRICS: CostMetric[] = ['self-time', 'samples'];

const NO_RUNTIME_NOTICE = '! no runtime data in graph — run `enrich` first. Inclusive cost needs measured self cost to propagate.';

export class CostCommand {
	static register(program: Command): void {
		program
			.command('cost')
			.description('propagate runtime self cost into inclusive cost and rank nodes by share of total')
			.argument('[id]', 'node id to break down causally; omit to rank the whole graph')
			.option('-d, --db <path>', 'Kùzu database path', DEFAULT_DB_PATH)
			.option('--by <metric>', `cost metric: ${METRICS.join(', ')}`, 'self-time')
			.option('--limit <n>', 'maximum number of ranked nodes to return', '20')
			.option('--json', 'emit raw JSON', false)
			.action(async (id: string | undefined, options: CostCommandOptions) => {
				if (options.by !== undefined && METRICS.includes(options.by as CostMetric) === false) {
					console.error(chalk.red(`unknown metric '${options.by}' — choose one of: ${METRICS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				const by = options.by as CostMetric | undefined;
				await CommandHelpers.withQuery(options.db, async (query) => {
					if (id === undefined) {
						const report = await query.costRanking({ by, limit: Number(options.limit) });
						CostCommand.printRanking(report, options.json === true);
						return;
					}
					const attribution = await query.costAttribution(id, { by });
					CostCommand.printAttribution(attribution, options.json === true);
				});
			});
	}

	private static printRanking(report: CostReport, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		if (report.enriched === false) {
			console.log(chalk.yellow(NO_RUNTIME_NOTICE));
			return;
		}
		const total = CostCommand.formatAmount(report.metric, report.totalSelf);
		console.log(chalk.bold(`Inclusive cost by ${report.metric}`) + chalk.gray(` (total self ${total})`));
		if (report.nodes.length === 0) {
			console.log(chalk.yellow('(no results)'));
			return;
		}
		report.nodes.forEach((node, index) => {
			const rank = chalk.gray(`${String(index + 1).padStart(2)}.`);
			const inclusive = chalk.cyan(CostCommand.formatAmount(report.metric, node.inclusiveCost).padStart(14));
			const share = chalk.green(CostCommand.formatShare(node.shareOfTotal).padStart(7));
			const mark = node.cyclic === true ? chalk.magenta(' ↺') : '';
			console.log(`${rank} ${inclusive} ${share}  ${chalk.gray(node.kind.padEnd(10))} ${chalk.bold(node.name)}${mark}  ${chalk.gray(`${node.filePath}:${node.startLine}`)}`);
		});
		console.log(chalk.gray(`\n${report.nodes.length} node(s) · share is of total self cost · ↺ = in a call cycle`));
	}

	private static printAttribution(attribution: CostAttribution, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(attribution, null, 2));
			return;
		}
		if (attribution.node === null) {
			console.log(chalk.yellow('(no such node — resolve an id with `find` first)'));
			return;
		}
		if (attribution.enriched === false) {
			console.log(chalk.yellow(NO_RUNTIME_NOTICE));
			return;
		}
		const node = attribution.node;
		const metric = attribution.metric;
		console.log(chalk.bold(node.name) + chalk.gray(`  ${node.kind} · ${node.filePath}:${node.startLine}`));
		console.log(
			`  self ${chalk.cyan(CostCommand.formatAmount(metric, node.selfCost))}`
			+ `  ·  inclusive ${chalk.cyan(CostCommand.formatAmount(metric, node.inclusiveCost))}`
			+ `  ·  share of total ${chalk.green(CostCommand.formatShare(node.shareOfTotal))}`,
		);
		if (node.cyclic === true) {
			console.log(chalk.magenta(`  ↺ part of a ${node.cycleSize}-node call cycle — inclusive cost is the cycle total, shared by its members`));
		}
		CostCommand.printFlows('Cost flows into (callees)', attribution.callees, metric, '->');
		CostCommand.printFlows('Attributed to callers', attribution.callers, metric, '<-');
	}

	private static printFlows(title: string, flows: CostFlow[], metric: CostMetric, arrow: string): void {
		console.log(chalk.bold(`\n${title}`));
		if (flows.length === 0) {
			console.log(chalk.gray('  (none)'));
			return;
		}
		for (const flow of flows) {
			const amount = chalk.cyan(CostCommand.formatAmount(metric, flow.amount).padStart(14));
			const share = chalk.green(CostCommand.formatShare(flow.share).padStart(7));
			console.log(`  ${chalk.gray(arrow)} ${amount} ${share}  ${chalk.bold(flow.name)}  ${chalk.gray(`${flow.filePath}:${flow.startLine}`)}`);
		}
	}

	private static formatAmount(metric: CostMetric, value: number): string {
		const rounded = Math.round(value * 1000) / 1000;
		return metric === 'self-time' ? `${rounded} ms` : `${rounded} samples`;
	}

	private static formatShare(share: number): string {
		return `${(share * 100).toFixed(1)}%`;
	}
}
