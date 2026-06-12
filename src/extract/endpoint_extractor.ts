import { relative } from 'node:path';
import { CallExpression, Node, SourceFile, SyntaxKind } from 'ts-morph';
import { GraphEdge } from '../schema/edge.js';
import { GraphNode } from '../schema/node.js';
import { NodeId } from './node_id.js';
import { ScopeResolver } from './scope_resolver.js';
import { Extraction } from './structural_extractor.js';

/** HTTP-verb method names that register a route on an Express/Fastify app or router. */
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all']);

/** A handler, classified: whether the call is a recognised route, and the node id of its handler when one exists. */
type Handler = { valid: boolean; id?: string };

/**
 * Detects HTTP route registrations in the Express/Fastify style —
 * `app.get('/path', handler)`, `router.post('/path', mw, handler)` — and emits an
 * `Endpoint` node (keyed by method + path) plus a `HANDLES` edge from the endpoint
 * to the function that handles it.
 *
 * A route is recognised syntactically: the callee is `<obj>.<verb>` for an HTTP
 * verb, the first argument is a string-literal path, and the last argument is a
 * handler — an inline function, or a name/member that resolves to an in-project
 * callable. Resolving the named handler is why this runs in the semantic pass; an
 * inline handler yields the `Endpoint` node alone (it has no declaration to point
 * at).
 *
 * The match is a heuristic (it does not prove `obj` is an Express app), but the
 * verb + string path + resolvable-handler combination is specific, so a project
 * with no such call sites is unchanged. Other routers (Nest decorators, …) are out
 * of scope for now — Express/Fastify first (#31 Part 3).
 */
export class EndpointExtractor {
	static extract(sourceFile: SourceFile, rootPath: string): Extraction {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];
		for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
			EndpointExtractor.extractRoute(call, rootPath, nodes, edges);
		}
		return { nodes, edges };
	}

	private static extractRoute(call: CallExpression, rootPath: string, nodes: GraphNode[], edges: GraphEdge[]): void {
		const callee = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
		if (callee === undefined || HTTP_METHODS.has(callee.getName()) === false) {
			return;
		}
		const args = call.getArguments();
		if (args.length < 2) {
			return;
		}
		const pathLiteral = args[0].asKind(SyntaxKind.StringLiteral);
		if (pathLiteral === undefined) {
			return;
		}
		const handler = EndpointExtractor.classifyHandler(args[args.length - 1], rootPath);
		if (handler.valid === false) {
			return;
		}
		const method = callee.getName().toUpperCase();
		const endpointId = NodeId.forEndpoint(method, pathLiteral.getLiteralText());
		nodes.push({
			id: endpointId,
			kind: 'Endpoint',
			name: `${method} ${pathLiteral.getLiteralText()}`,
			filePath: relative(rootPath, call.getSourceFile().getFilePath()),
			range: {
				startLine: call.getStartLineNumber(),
				startColumn: 0,
				endLine: call.getEndLineNumber(),
				endColumn: 0,
			},
		});
		if (handler.id !== undefined) {
			edges.push({ id: `HANDLES:${endpointId}->${handler.id}`, kind: 'HANDLES', from: endpointId, to: handler.id });
		}
	}

	/**
	 * Classifies the last argument of a route call. An inline function is a valid
	 * handler with no node to point at; a name/member that resolves to an in-project
	 * callable is a valid handler whose emitted declaration becomes the `HANDLES`
	 * target; anything else means this is not a route.
	 */
	private static classifyHandler(handler: Node, rootPath: string): Handler {
		if (Node.isArrowFunction(handler) === true || Node.isFunctionExpression(handler) === true) {
			return { valid: true };
		}
		const declaration = EndpointExtractor.resolveCallable(handler);
		if (declaration === undefined) {
			return { valid: false };
		}
		if (ScopeResolver.isEmitted(declaration) === true) {
			return { valid: true, id: NodeId.forDeclaration(declaration, rootPath) };
		}
		return { valid: true };
	}

	/** Resolves a handler name/member to the in-project function, method, or function-valued variable it refers to. */
	private static resolveCallable(node: Node): Node | undefined {
		const declaration = EndpointExtractor.resolve(node);
		if (declaration === undefined || EndpointExtractor.inProject(declaration) === false) {
			return undefined;
		}
		const kind = declaration.getKind();
		if (kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration) {
			return declaration;
		}
		if (kind === SyntaxKind.VariableDeclaration) {
			const initializer = declaration.asKind(SyntaxKind.VariableDeclaration)?.getInitializer();
			if (initializer !== undefined && (Node.isArrowFunction(initializer) === true || Node.isFunctionExpression(initializer) === true)) {
				return declaration;
			}
		}
		return undefined;
	}

	private static resolve(node: Node): Node | undefined {
		const symbol = node.getSymbol();
		const resolved = symbol?.getAliasedSymbol() ?? symbol;
		return resolved?.getDeclarations()[0];
	}

	private static inProject(node: Node): boolean {
		const sourceFile = node.getSourceFile();
		return sourceFile.getFilePath().includes('/node_modules/') === false
			&& sourceFile.isDeclarationFile() === false;
	}
}
