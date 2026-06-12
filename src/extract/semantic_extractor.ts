import {
	ClassDeclaration,
	FunctionDeclaration,
	InterfaceDeclaration,
	MethodDeclaration,
	MethodSignature,
	Node,
	SourceFile,
	SyntaxKind,
	TypeNode,
} from 'ts-morph';
import { GraphEdge } from '../schema/edge.js';
import { NodeId } from './node_id.js';
import { Extraction } from './structural_extractor.js';

type Signatured = FunctionDeclaration | MethodDeclaration | MethodSignature;

const CALLABLE_TARGET_KINDS = new Set<SyntaxKind>([
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.MethodDeclaration,
	SyntaxKind.MethodSignature,
	SyntaxKind.VariableDeclaration,
]);

const TYPE_DECL_KINDS = new Set<SyntaxKind>([
	SyntaxKind.ClassDeclaration,
	SyntaxKind.InterfaceDeclaration,
	SyntaxKind.TypeAliasDeclaration,
	SyntaxKind.EnumDeclaration,
]);

const VALUE_DECL_KINDS = new Set<SyntaxKind>([
	SyntaxKind.VariableDeclaration,
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.ClassDeclaration,
	SyntaxKind.EnumDeclaration,
]);

const SCOPE_KINDS = new Set<SyntaxKind>([
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.MethodDeclaration,
	SyntaxKind.PropertyDeclaration,
	SyntaxKind.PropertySignature,
	SyntaxKind.VariableDeclaration,
	SyntaxKind.TypeAliasDeclaration,
	SyntaxKind.EnumDeclaration,
	SyntaxKind.ClassDeclaration,
	SyntaxKind.InterfaceDeclaration,
]);

/** Binary-expression operators that assign to their left-hand side: `=` plus every compound form (`+=`, `&&=`, …). */
const ASSIGNMENT_OPERATORS = new Set<SyntaxKind>([
	SyntaxKind.EqualsToken,
	SyntaxKind.PlusEqualsToken,
	SyntaxKind.MinusEqualsToken,
	SyntaxKind.AsteriskEqualsToken,
	SyntaxKind.AsteriskAsteriskEqualsToken,
	SyntaxKind.SlashEqualsToken,
	SyntaxKind.PercentEqualsToken,
	SyntaxKind.LessThanLessThanEqualsToken,
	SyntaxKind.GreaterThanGreaterThanEqualsToken,
	SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
	SyntaxKind.AmpersandEqualsToken,
	SyntaxKind.BarEqualsToken,
	SyntaxKind.CaretEqualsToken,
	SyntaxKind.AmpersandAmpersandEqualsToken,
	SyntaxKind.BarBarEqualsToken,
	SyntaxKind.QuestionQuestionEqualsToken,
]);

export class SemanticExtractor {
	static extract(sourceFile: SourceFile, rootPath: string): Extraction {
		const edges: GraphEdge[] = [];
		for (const cls of sourceFile.getClasses()) {
			SemanticExtractor.extractClass(cls, rootPath, edges);
		}
		for (const iface of sourceFile.getInterfaces()) {
			SemanticExtractor.extractInterface(iface, rootPath, edges);
		}
		for (const fn of sourceFile.getFunctions()) {
			SemanticExtractor.extractSignature(fn, rootPath, edges);
		}
		for (const variable of sourceFile.getVariableDeclarations()) {
			SemanticExtractor.addTypeEdges(NodeId.forDeclaration(variable, rootPath), variable.getTypeNode(), 'USES_TYPE', rootPath, edges);
		}
		for (const alias of sourceFile.getTypeAliases()) {
			SemanticExtractor.addTypeEdges(NodeId.forDeclaration(alias, rootPath), alias.getTypeNode(), 'USES_TYPE', rootPath, edges);
		}
		SemanticExtractor.extractCalls(sourceFile, rootPath, edges);
		SemanticExtractor.extractInstantiations(sourceFile, rootPath, edges);
		SemanticExtractor.extractReads(sourceFile, rootPath, edges);
		SemanticExtractor.extractWrites(sourceFile, rootPath, edges);
		return { nodes: [], edges };
	}

	private static extractClass(cls: ClassDeclaration, rootPath: string, edges: GraphEdge[]): void {
		const classId = NodeId.forDeclaration(cls, rootPath);
		const base = cls.getBaseClass();
		if (base !== undefined && SemanticExtractor.inProject(base) === true) {
			edges.push(SemanticExtractor.edge('EXTENDS', classId, NodeId.forDeclaration(base, rootPath)));
		}
		for (const impl of cls.getImplements()) {
			const decl = SemanticExtractor.resolve(impl.getExpression());
			if (decl !== undefined && SemanticExtractor.inProject(decl) === true) {
				edges.push(SemanticExtractor.edge('IMPLEMENTS', classId, NodeId.forDeclaration(decl, rootPath)));
			}
		}
		for (const method of cls.getMethods()) {
			SemanticExtractor.extractSignature(method, rootPath, edges);
			SemanticExtractor.extractOverrides(cls, method, rootPath, edges);
		}
		for (const property of cls.getProperties()) {
			SemanticExtractor.addTypeEdges(NodeId.forDeclaration(property, rootPath), property.getTypeNode(), 'USES_TYPE', rootPath, edges);
		}
	}

	/**
	 * Emit an `OVERRIDES` edge from a class method to the member it overrides:
	 * the nearest base-class method of the same name, and any implemented
	 * interface method of the same name. The target id is computed with
	 * {@link NodeId.forDeclaration} on the resolved declaration, so it matches
	 * the node the structural extractor already emitted for that member.
	 */
	private static extractOverrides(
		cls: ClassDeclaration,
		method: MethodDeclaration,
		rootPath: string,
		edges: GraphEdge[],
	): void {
		const name = method.getName();
		const fromId = NodeId.forDeclaration(method, rootPath);

		let base = cls.getBaseClass();
		while (base !== undefined) {
			const overridden = base.getMethod(name);
			if (overridden !== undefined) {
				if (SemanticExtractor.inProject(overridden) === true) {
					edges.push(SemanticExtractor.edge('OVERRIDES', fromId, NodeId.forDeclaration(overridden, rootPath)));
				}
				break;
			}
			base = base.getBaseClass();
		}

		for (const impl of cls.getImplements()) {
			const decl = SemanticExtractor.resolve(impl.getExpression());
			const iface = decl?.asKind(SyntaxKind.InterfaceDeclaration);
			if (iface === undefined || SemanticExtractor.inProject(iface) === false) {
				continue;
			}
			const signature = iface.getMethod(name);
			if (signature !== undefined) {
				edges.push(SemanticExtractor.edge('OVERRIDES', fromId, NodeId.forDeclaration(signature, rootPath)));
			}
		}
	}

	private static extractInterface(iface: InterfaceDeclaration, rootPath: string, edges: GraphEdge[]): void {
		const ifaceId = NodeId.forDeclaration(iface, rootPath);
		for (const base of iface.getBaseDeclarations()) {
			if (SemanticExtractor.inProject(base) === true) {
				edges.push(SemanticExtractor.edge('EXTENDS', ifaceId, NodeId.forDeclaration(base, rootPath)));
			}
		}
		for (const method of iface.getMethods()) {
			SemanticExtractor.extractSignature(method, rootPath, edges);
		}
		for (const property of iface.getProperties()) {
			SemanticExtractor.addTypeEdges(NodeId.forDeclaration(property, rootPath), property.getTypeNode(), 'USES_TYPE', rootPath, edges);
		}
	}

	private static extractSignature(node: Signatured, rootPath: string, edges: GraphEdge[]): void {
		const id = NodeId.forDeclaration(node, rootPath);
		SemanticExtractor.addTypeEdges(id, node.getReturnTypeNode(), 'RETURNS', rootPath, edges);
		for (const parameter of node.getParameters()) {
			SemanticExtractor.addTypeEdges(id, parameter.getTypeNode(), 'PARAM_TYPE', rootPath, edges);
		}
	}

	private static addTypeEdges(
		fromId: string,
		typeNode: TypeNode | undefined,
		kind: GraphEdge['kind'],
		rootPath: string,
		edges: GraphEdge[],
	): void {
		if (typeNode === undefined) {
			return;
		}
		for (const decl of SemanticExtractor.referencedTypes(typeNode)) {
			if (SemanticExtractor.inProject(decl) === false || TYPE_DECL_KINDS.has(decl.getKind()) === false) {
				continue;
			}
			edges.push(SemanticExtractor.edge(kind, fromId, NodeId.forDeclaration(decl, rootPath)));
		}
	}

	private static referencedTypes(typeNode: TypeNode): Node[] {
		const references = typeNode.getDescendantsOfKind(SyntaxKind.TypeReference);
		const self = typeNode.asKind(SyntaxKind.TypeReference);
		if (self !== undefined) {
			references.unshift(self);
		}
		const declarations: Node[] = [];
		for (const reference of references) {
			const symbol = reference.getTypeName().getSymbol();
			const resolved = symbol?.getAliasedSymbol() ?? symbol;
			const declaration = resolved?.getDeclarations()[0];
			if (declaration !== undefined) {
				declarations.push(declaration);
			}
		}
		return declarations;
	}

	private static extractCalls(sourceFile: SourceFile, rootPath: string, edges: GraphEdge[]): void {
		for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
			const caller = SemanticExtractor.enclosingDeclaration(call);
			if (caller === undefined) {
				continue;
			}
			const callee = SemanticExtractor.resolve(call.getExpression());
			if (callee === undefined || SemanticExtractor.inProject(callee) === false) {
				continue;
			}
			if (CALLABLE_TARGET_KINDS.has(callee.getKind()) === false) {
				continue;
			}
			edges.push(SemanticExtractor.edge(
				'CALLS',
				NodeId.forDeclaration(caller, rootPath),
				NodeId.forDeclaration(callee, rootPath),
			));
		}
	}

	private static extractInstantiations(sourceFile: SourceFile, rootPath: string, edges: GraphEdge[]): void {
		for (const expression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
			const caller = SemanticExtractor.enclosingDeclaration(expression);
			if (caller === undefined) {
				continue;
			}
			const target = SemanticExtractor.resolve(expression.getExpression());
			if (target === undefined || SemanticExtractor.inProject(target) === false) {
				continue;
			}
			if (target.getKind() !== SyntaxKind.ClassDeclaration) {
				continue;
			}
			edges.push(SemanticExtractor.edge(
				'INSTANTIATES',
				NodeId.forDeclaration(caller, rootPath),
				NodeId.forDeclaration(target, rootPath),
			));
		}
	}

	private static extractReads(sourceFile: SourceFile, rootPath: string, edges: GraphEdge[]): void {
		SemanticExtractor.extractValueAccess(sourceFile, rootPath, edges, 'READS', (identifier) => SemanticExtractor.isValueRead(identifier));
	}

	private static extractWrites(sourceFile: SourceFile, rootPath: string, edges: GraphEdge[]): void {
		SemanticExtractor.extractValueAccess(sourceFile, rootPath, edges, 'WRITES', (identifier) => SemanticExtractor.isValueWrite(identifier));
	}

	/**
	 * Emits a value-access edge from the enclosing scope to each in-project,
	 * module-level value declaration an identifier touches. `accesses` selects the
	 * identifiers (a read or a write) and `kind` is the edge emitted; the rest — the
	 * target must be an emitted top-level value declaration, a declaration's own name
	 * is skipped, self-edges are dropped — is shared by both. Repeated accesses
	 * collapse into one counted edge in {@link GraphBuilder}.
	 */
	private static extractValueAccess(
		sourceFile: SourceFile,
		rootPath: string,
		edges: GraphEdge[],
		kind: 'READS' | 'WRITES',
		accesses: (identifier: Node) => boolean,
	): void {
		for (const identifier of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
			if (accesses(identifier) === false) {
				continue;
			}
			const target = SemanticExtractor.resolve(identifier);
			if (target === undefined || SemanticExtractor.inProject(target) === false) {
				continue;
			}
			if (VALUE_DECL_KINDS.has(target.getKind()) === false || SemanticExtractor.isEmittedTarget(target) === false) {
				continue;
			}
			if (SemanticExtractor.isDeclarationName(identifier, target) === true) {
				continue;
			}
			const scope = SemanticExtractor.readerScope(identifier);
			if (scope === undefined) {
				continue;
			}
			const fromId = NodeId.forDeclaration(scope, rootPath);
			const toId = NodeId.forDeclaration(target, rootPath);
			if (fromId !== toId) {
				edges.push(SemanticExtractor.edge(kind, fromId, toId));
			}
		}
	}

	private static isValueRead(identifier: Node): boolean {
		if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== undefined) {
			return false;
		}
		if (identifier.getFirstAncestorByKind(SyntaxKind.HeritageClause) !== undefined) {
			return false;
		}
		const parent = identifier.getParent();
		if (parent === undefined) {
			return false;
		}
		if (Node.isPropertyAccessExpression(parent)) {
			return parent.getNameNode() !== identifier;
		}
		if (Node.isQualifiedName(parent)) {
			return parent.getRight() !== identifier;
		}
		if (Node.isCallExpression(parent) || Node.isNewExpression(parent)) {
			return parent.getExpression() !== identifier;
		}
		if (Node.isPropertyAssignment(parent)) {
			return parent.getNameNode() !== identifier;
		}
		if (Node.isBinaryExpression(parent)) {
			return parent.getLeft() !== identifier
				|| parent.getOperatorToken().getKind() !== SyntaxKind.EqualsToken;
		}
		if (Node.isTypeReference(parent) || Node.isPropertySignature(parent) || Node.isPropertyDeclaration(parent) || Node.isBindingElement(parent)) {
			return false;
		}
		return true;
	}

	/**
	 * Whether an identifier is written: the left-hand side of an assignment
	 * (`x = …`, `x += …`) or the operand of a `++`/`--`. A compound assignment and an
	 * increment also read the old value, so {@link isValueRead} reports those
	 * identifiers too; a plain `x = …` is a write only.
	 */
	private static isValueWrite(identifier: Node): boolean {
		const parent = identifier.getParent();
		if (parent === undefined) {
			return false;
		}
		if (Node.isBinaryExpression(parent)) {
			return parent.getLeft() === identifier
				&& ASSIGNMENT_OPERATORS.has(parent.getOperatorToken().getKind());
		}
		if (Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) {
			const operator = parent.getOperatorToken();
			return parent.getOperand() === identifier
				&& (operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken);
		}
		return false;
	}

	private static isDeclarationName(identifier: Node, declaration: Node): boolean {
		const named = declaration as { getNameNode?: () => Node | undefined };
		return typeof named.getNameNode === 'function' && named.getNameNode() === identifier;
	}

	private static isEmittedTarget(declaration: Node): boolean {
		if (Node.isVariableDeclaration(declaration)) {
			const statement = declaration.getVariableStatement();
			return statement !== undefined && statement.getParent()?.getKind() === SyntaxKind.SourceFile;
		}
		return declaration.getParent()?.getKind() === SyntaxKind.SourceFile;
	}

	private static readerScope(node: Node): Node | undefined {
		const executable = node.getFirstAncestor((ancestor) => {
			const kind = ancestor.getKind();
			return kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration;
		});
		if (executable !== undefined) {
			return executable;
		}
		return node.getFirstAncestor((ancestor) => SCOPE_KINDS.has(ancestor.getKind()));
	}

	private static enclosingDeclaration(node: Node): Node | undefined {
		return node.getFirstAncestor((ancestor) => {
			const kind = ancestor.getKind();
			return kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration;
		});
	}

	private static resolve(node: Node): Node | undefined {
		const symbol = node.getSymbol();
		if (symbol === undefined) {
			return undefined;
		}
		const resolved = symbol.getAliasedSymbol() ?? symbol;
		const declarations = resolved.getDeclarations();
		return declarations.length === 0 ? undefined : declarations[0];
	}

	private static inProject(node: Node): boolean {
		const sourceFile = node.getSourceFile();
		return sourceFile.getFilePath().includes('/node_modules/') === false
			&& sourceFile.isDeclarationFile() === false;
	}

	private static edge(kind: GraphEdge['kind'], from: string, to: string): GraphEdge {
		return { id: `${kind}:${from}->${to}`, kind, from, to };
	}
}
