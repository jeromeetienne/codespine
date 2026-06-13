import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GraphEdge } from '../schema/edge.js';
import { GraphNode } from '../schema/node.js';
import { SourceManifest } from '../schema/source_manifest.js';

export class JsonlStore {
	static async write(outDir: string, nodes: GraphNode[], edges: GraphEdge[], source?: SourceManifest): Promise<void> {
		await mkdir(outDir, { recursive: true });
		await writeFile(join(outDir, 'nodes.jsonl'), JsonlStore.serialize(nodes), 'utf8');
		await writeFile(join(outDir, 'edges.jsonl'), JsonlStore.serialize(edges), 'utf8');
		if (source !== undefined) {
			await writeFile(join(outDir, 'source.json'), JSON.stringify(source) + '\n', 'utf8');
		}
	}

	private static serialize(rows: unknown[]): string {
		return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
	}
}
