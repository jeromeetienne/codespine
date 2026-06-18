import { relative } from 'node:path';
import {
	ClassDeclaration,
	FunctionDeclaration,
	InterfaceDeclaration,
	JSDoc,
	MethodDeclaration,
	MethodSignature,
	Node,
	SourceFile,
} from 'ts-morph';
import { GraphEdge } from '../schema/edge.js';
import { GraphNode, NodeKind } from '../schema/node.js';
import { NodeId } from './node_id.js';

export type Extraction = {
	nodes: GraphNode[];
	edges: GraphEdge[];
};

/**
 * Upper bound on the JSDoc summary stored on a node. The summary feeds at-a-glance
 * hover tooltips in the web viewer (#93), so an over-long description is truncated
 * with an ellipsis rather than bloating every node record in `nodes.jsonl`.
 */
const MAX_DOCUMENTATION_LENGTH = 400;

export class StructuralExtractor {
	static extract(sourceFile: SourceFile, rootPath: string): Extraction {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];
		const filePath = relative(rootPath, sourceFile.getFilePath());
		const moduleId = NodeId.forModule(sourceFile.getFilePath(), rootPath);

		nodes.push({ id: moduleId, kind: 'Module', name: filePath, filePath });

		StructuralExtractor.extractImports(sourceFile, moduleId, rootPath, nodes, edges);

		for (const cls of sourceFile.getClasses()) {
			StructuralExtractor.extractClass(cls, moduleId, rootPath, nodes, edges);
		}
		for (const iface of sourceFile.getInterfaces()) {
			StructuralExtractor.extractInterface(iface, moduleId, rootPath, nodes, edges);
		}
		for (const alias of sourceFile.getTypeAliases()) {
			StructuralExtractor.push(alias, 'TypeAlias', moduleId, moduleId, rootPath, nodes, edges);
		}
		for (const en of sourceFile.getEnums()) {
			StructuralExtractor.push(en, 'Enum', moduleId, moduleId, rootPath, nodes, edges);
		}
		for (const fn of sourceFile.getFunctions()) {
			const fnId = StructuralExtractor.push(fn, 'Function', moduleId, moduleId, rootPath, nodes, edges);
			StructuralExtractor.extractParameters(fn, fnId, moduleId, rootPath, nodes, edges);
		}
		for (const variable of sourceFile.getVariableDeclarations()) {
			StructuralExtractor.push(variable, 'Variable', moduleId, moduleId, rootPath, nodes, edges);
		}

		return { nodes, edges };
	}

	private static extractImports(
		sourceFile: SourceFile,
		moduleId: string,
		rootPath: string,
		nodes: GraphNode[],
		edges: GraphEdge[],
	): void {
		for (const decl of sourceFile.getImportDeclarations()) {
			const specifier = decl.getModuleSpecifierValue();
			const target = decl.getModuleSpecifierSourceFile();
			if (target !== undefined && StructuralExtractor.isInternal(target) === true) {
				const targetId = NodeId.forModule(target.getFilePath(), rootPath);
				edges.push(StructuralExtractor.edge('IMPORTS', moduleId, targetId, { specifier }));
				continue;
			}
			const externalId = NodeId.forExternalModule(specifier);
			nodes.push({ id: externalId, kind: 'ExternalModule', name: specifier, filePath: specifier });
			edges.push(StructuralExtractor.edge('IMPORTS', moduleId, externalId, { specifier }));
		}
	}

	private static extractClass(
		cls: ClassDeclaration,
		moduleId: string,
		rootPath: string,
		nodes: GraphNode[],
		edges: GraphEdge[],
	): void {
		const classId = StructuralExtractor.push(cls, 'Class', moduleId, moduleId, rootPath, nodes, edges);
		for (const method of cls.getMethods()) {
			const methodId = StructuralExtractor.push(method, 'Method', classId, moduleId, rootPath, nodes, edges);
			StructuralExtractor.extractParameters(method, methodId, moduleId, rootPath, nodes, edges);
		}
		for (const property of cls.getProperties()) {
			StructuralExtractor.push(property, 'Property', classId, moduleId, rootPath, nodes, edges);
		}
	}

	private static extractInterface(
		iface: InterfaceDeclaration,
		moduleId: string,
		rootPath: string,
		nodes: GraphNode[],
		edges: GraphEdge[],
	): void {
		const ifaceId = StructuralExtractor.push(iface, 'Interface', moduleId, moduleId, rootPath, nodes, edges);
		for (const method of iface.getMethods()) {
			const methodId = StructuralExtractor.push(method, 'Method', ifaceId, moduleId, rootPath, nodes, edges);
			StructuralExtractor.extractParameters(method, methodId, moduleId, rootPath, nodes, edges);
		}
		for (const property of iface.getProperties()) {
			StructuralExtractor.push(property, 'Property', ifaceId, moduleId, rootPath, nodes, edges);
		}
	}

	/**
	 * Emits a `Parameter` node and a `CONTAINS` edge for each parameter of a function
	 * or method. Parameters are pure structure (no symbol resolution), nested under
	 * their callable exactly like a `Property` is nested under its class — they are
	 * never exported and carry no JSDoc of their own, so {@link StructuralExtractor.push}
	 * gives them a `CONTAINS` edge and nothing else.
	 */
	private static extractParameters(
		owner: FunctionDeclaration | MethodDeclaration | MethodSignature,
		ownerId: string,
		moduleId: string,
		rootPath: string,
		nodes: GraphNode[],
		edges: GraphEdge[],
	): void {
		for (const parameter of owner.getParameters()) {
			StructuralExtractor.push(parameter, 'Parameter', ownerId, moduleId, rootPath, nodes, edges);
		}
	}

	/**
	 * Pushes a declaration node, its `CONTAINS` edge from `parentId`, and — when the
	 * declaration is exported — an `EXPORTS` edge from `moduleId`. Only top-level
	 * declarations are ever exported, so `EXPORTS` always originates at the module;
	 * nested members (methods, properties) carry `exported === false` and get none.
	 */
	private static push(
		node: Node,
		kind: NodeKind,
		parentId: string,
		moduleId: string,
		rootPath: string,
		nodes: GraphNode[],
		edges: GraphEdge[],
	): string {
		const id = NodeId.forDeclaration(node, rootPath);
		const exported = StructuralExtractor.isExported(node);
		const documentation = StructuralExtractor.documentationOf(node);
		const graphNode: GraphNode = {
			id,
			kind,
			name: NodeId.nameOf(node),
			filePath: relative(rootPath, node.getSourceFile().getFilePath()),
			range: {
				startLine: node.getStartLineNumber(),
				startColumn: 0,
				endLine: node.getEndLineNumber(),
				endColumn: 0,
			},
			exported,
		};
		if (documentation !== undefined) {
			graphNode.metadata = { documentation };
		}
		nodes.push(graphNode);
		edges.push(StructuralExtractor.edge('CONTAINS', parentId, id));
		if (exported === true) {
			edges.push(StructuralExtractor.edge('EXPORTS', moduleId, id));
		}
		return id;
	}

	/**
	 * The leading JSDoc summary of a declaration: the first paragraph of its doc
	 * comment, with wrapped lines collapsed to a single line and the result capped at
	 * {@link MAX_DOCUMENTATION_LENGTH}. Returns `undefined` when the declaration has no
	 * doc comment or its description is empty (a comment of only `@param`/`@returns`
	 * tags). Stored as `metadata.documentation` and surfaced in the web viewer's node
	 * tooltips (#93) so the graph reads well on an unfamiliar codebase.
	 */
	private static documentationOf(node: Node): string | undefined {
		const jsDocs = StructuralExtractor.jsDocsOf(node);
		if (jsDocs.length === 0) {
			return undefined;
		}
		const description = jsDocs[jsDocs.length - 1].getDescription().trim();
		if (description.length === 0) {
			return undefined;
		}
		const summary = description
			.split(/\n\s*\n/)[0]
			.replace(/\s+/g, ' ')
			.replace(/\{@(?:link|linkcode|linkplain)\s+([^}]+)\}/g, (_match, target: string) => StructuralExtractor.linkText(target))
			.trim();
		if (summary.length === 0) {
			return undefined;
		}
		if (summary.length <= MAX_DOCUMENTATION_LENGTH) {
			return summary;
		}
		return summary.slice(0, MAX_DOCUMENTATION_LENGTH - 1).trimEnd() + '…';
	}

	/**
	 * The human-readable text of an inline JSDoc link tag's body. A `target | display`
	 * or `target display` form yields the display text; a bare `target` yields the
	 * symbol name. Keeps `{@link Foo}` from reaching a tooltip as raw markup.
	 */
	private static linkText(target: string): string {
		const piped = target.split('|');
		if (piped.length > 1) {
			return piped[piped.length - 1].trim();
		}
		return target.trim().split(/\s+/)[0];
	}

	/**
	 * The JSDoc blocks attached to a declaration. A variable declaration carries no
	 * JSDoc of its own — the comment sits on the enclosing `VariableStatement` — so
	 * that case is resolved through the parent statement before the general check.
	 */
	private static jsDocsOf(node: Node): JSDoc[] {
		if (Node.isVariableDeclaration(node) === true) {
			const statement = node.getVariableStatement();
			return statement === undefined ? [] : statement.getJsDocs();
		}
		if (Node.isJSDocable(node) === true) {
			return node.getJsDocs();
		}
		return [];
	}

	private static isInternal(sourceFile: SourceFile): boolean {
		return sourceFile.getFilePath().includes('/node_modules/') === false
			&& sourceFile.isDeclarationFile() === false;
	}

	private static isExported(node: Node): boolean {
		const probe = node as { isExported?: () => boolean };
		return typeof probe.isExported === 'function' ? probe.isExported() : false;
	}

	private static edge(
		kind: GraphEdge['kind'],
		from: string,
		to: string,
		metadata?: Record<string, unknown>,
	): GraphEdge {
		const edge: GraphEdge = { id: `${kind}:${from}->${to}`, kind, from, to };
		if (metadata !== undefined) {
			edge.metadata = metadata;
		}
		return edge;
	}
}
