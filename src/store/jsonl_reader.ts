import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { GraphEdge, GraphEdgeSchema } from '../schema/edge.js';
import { GraphNode, GraphNodeSchema } from '../schema/node.js';
import { SourceManifest, SourceManifestSchema } from '../schema/source_manifest.js';

export type GraphData = {
	nodes: GraphNode[];
	edges: GraphEdge[];
	source?: SourceManifest;
};

export class JsonlReader {
	static async read(dir: string): Promise<GraphData> {
		const nodes = await JsonlReader.readLines(join(dir, 'nodes.jsonl'), GraphNodeSchema);
		const edges = await JsonlReader.readLines(join(dir, 'edges.jsonl'), GraphEdgeSchema);
		const source = await JsonlReader.readSource(join(dir, 'source.json'));
		return { nodes, edges, source };
	}

	/** Reads the optional `source.json` provenance manifest; an absent or malformed file yields `undefined`. */
	private static async readSource(path: string): Promise<SourceManifest | undefined> {
		try {
			const parsed = SourceManifestSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
			return parsed.success === true ? parsed.data : undefined;
		} catch {
			return undefined;
		}
	}

	private static async readLines<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
		const content = await readFile(path, 'utf8');
		return content
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => schema.parse(JSON.parse(line)));
	}
}
