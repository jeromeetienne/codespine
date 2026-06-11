import { Tokenizer } from './lexer/tokenizer.js';
import { Parser } from './parser/parser.js';
import { Evaluator } from './eval/evaluator.js';
import type { Expression } from './parser/ast.js';

/** The public entry point: evaluate an arithmetic expression string to a number. */
export class Calc {
	/** Tokenize, parse, and evaluate `expression`. */
	static evaluate(expression: string): number {
		const ast = Calc.parse(expression);
		return Evaluator.evaluate(ast);
	}

	/** Parse `expression` into an AST without evaluating it. */
	static parse(expression: string): Expression {
		const tokens = new Tokenizer(expression).tokenize();
		return new Parser(tokens).parse();
	}
}
