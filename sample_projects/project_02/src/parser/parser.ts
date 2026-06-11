import { TokenType } from '../lexer/token.js';
import type { Token } from '../lexer/token.js';
import type { BinaryExpression, Expression, NumberLiteral } from './ast.js';

/** Recursive-descent parser turning a token list into an {@link Expression} AST. */
export class Parser {
	private readonly tokens: Token[];
	private position: number;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
		this.position = 0;
	}

	/** Parse the full token stream into a single expression tree. */
	parse(): Expression {
		const expression = this.parseExpression();
		this.expect(TokenType.End);
		return expression;
	}

	/** Addition and subtraction — lowest precedence. */
	private parseExpression(): Expression {
		let left = this.parseTerm();
		while (this.peek() === TokenType.Plus || this.peek() === TokenType.Minus) {
			const operator = this.peek() === TokenType.Plus ? '+' : '-';
			this.position += 1;
			left = this.makeBinary(operator, left, this.parseTerm());
		}
		return left;
	}

	/** Multiplication and division. */
	private parseTerm(): Expression {
		let left = this.parseFactor();
		while (this.peek() === TokenType.Star || this.peek() === TokenType.Slash) {
			const operator = this.peek() === TokenType.Star ? '*' : '/';
			this.position += 1;
			left = this.makeBinary(operator, left, this.parseFactor());
		}
		return left;
	}

	/** Unary minus, then a primary. */
	private parseFactor(): Expression {
		if (this.peek() === TokenType.Minus) {
			this.position += 1;
			return { kind: 'UnaryExpression', operand: this.parseFactor() };
		}
		return this.parsePrimary();
	}

	/** A number literal or a parenthesised sub-expression. */
	private parsePrimary(): Expression {
		if (this.peek() === TokenType.LeftParen) {
			return this.parseParenthesized();
		}
		return this.parseNumber();
	}

	/**
	 * Parse `( expression )`.
	 *
	 * Dominant optimisation target: a single-use helper — only
	 * {@link Parser.parsePrimary} calls it, so `who-calls` returns exactly one
	 * caller. A natural inline candidate.
	 */
	private parseParenthesized(): Expression {
		this.expect(TokenType.LeftParen);
		const expression = this.parseExpression();
		this.expect(TokenType.RightParen);
		return expression;
	}

	/** Parse a single number literal. */
	private parseNumber(): NumberLiteral {
		const token = this.tokens[this.position];
		this.expect(TokenType.Number);
		return { kind: 'NumberLiteral', value: Number(token.value) };
	}

	/** Build a binary-expression node — called by both precedence levels. */
	private makeBinary(
		operator: BinaryExpression['operator'],
		left: Expression,
		right: Expression,
	): BinaryExpression {
		return { kind: 'BinaryExpression', operator, left, right };
	}

	/** The type of the current, unconsumed token. */
	private peek(): TokenType {
		return this.tokens[this.position].type;
	}

	/** Consume the current token, asserting it has the expected type. */
	private expect(type: TokenType): void {
		const actual = this.tokens[this.position].type;
		if (actual !== type) {
			throw new Error(`expected ${type} but found ${actual}`);
		}
		this.position += 1;
	}
}
