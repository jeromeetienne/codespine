import { z } from 'zod';

/**
 * The closed node vocabulary. See {@link EDGE_KINDS} in `edge.ts` for the
 * closed-enum-vs-registry decision (#31 Part 0); the same reasoning applies here.
 *
 * The system-level group grows one detection-gated extractor at a time (#31).
 * `ConfigFlag` (environment variables) is the first; `Endpoint`, `DatabaseTable`,
 * `QueueTopic`, and `ExternalAPI` arrive in later slices.
 */
export const NODE_KINDS = [
	// Code structure.
	'Module',
	'Class',
	'Interface',
	'TypeAlias',
	'Enum',
	'Function',
	'Method',
	'Property',
	'Parameter',
	'Variable',
	// External dependencies, as one opaque node per import specifier.
	'ExternalModule',
	// System-level entities — detection-gated (#31 Part 2+).
	'ConfigFlag',
	'ExternalAPI',
	'Endpoint',
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * One-line, onboarding-oriented descriptions for every {@link NodeKind}, keyed by
 * kind. This is the single source of truth surfaced as hover tooltips in the web
 * visualisation; the `Record<NodeKind, string>` type makes adding a node kind
 * without describing it a compile error.
 */
export const NODE_KIND_DESCRIPTIONS: Record<NodeKind, string> = {
	Module: 'A source file in the codebase.',
	Class: 'A class declaration.',
	Interface: 'An interface declaration.',
	TypeAlias: 'A type alias declaration.',
	Enum: 'An enum declaration.',
	Function: 'A standalone, module-level function.',
	Method: 'A function that belongs to a class or interface.',
	Property: 'A field declared on a class or interface.',
	Parameter: 'A parameter of a function or method.',
	Variable: 'A module- or block-level variable binding.',
	ExternalModule: 'An imported third-party or Node.js module, recorded as one opaque node per import specifier.',
	ConfigFlag: 'An environment-variable configuration flag, detected from process.env reads.',
	ExternalAPI: 'An outbound HTTP host called through fetch(), with one node per host.',
	Endpoint: 'An HTTP route registered by the app, such as app.get("/users", handler).',
};

export const RangeSchema = z.object({
	startLine: z.number().int(),
	startColumn: z.number().int(),
	endLine: z.number().int(),
	endColumn: z.number().int(),
});
export type Range = z.infer<typeof RangeSchema>;

export const GraphNodeSchema = z.object({
	id: z.string(),
	kind: NodeKindSchema,
	name: z.string(),
	filePath: z.string(),
	range: RangeSchema.optional(),
	exported: z.boolean().optional(),
	metadata: z.record(z.unknown()).optional(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;
