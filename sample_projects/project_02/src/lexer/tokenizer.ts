import { TokenType } from './token.js';
import type { Token } from './token.js';

/** Converts an arithmetic expression string into a flat list of {@link Token}s. */
export class Tokenizer {
	private readonly input: string;
	private position: number;

	constructor(input: string) {
		this.input = input;
		this.position = 0;
	}

	/** Produce every token in the input, terminated by a single `End` token. */
	tokenize(): Token[] {
		const tokens: Token[] = [];
		while (this.position < this.input.length) {
			const char = this.input[this.position];
			if (char === ' ') {
				this.position += 1;
				continue;
			}
			if (Tokenizer.isDigit(char) === true) {
				tokens.push(this.readNumber());
				continue;
			}
			tokens.push(this.readSymbol(char));
		}
		tokens.push({ type: TokenType.End, value: '' });
		return tokens;
	}

	/** Read a multi-digit, optionally decimal, number starting at the cursor. */
	private readNumber(): Token {
		let value = '';
		while (
			this.position < this.input.length &&
			(Tokenizer.isDigit(this.input[this.position]) === true ||
				this.input[this.position] === '.')
		) {
			value += this.input[this.position];
			this.position += 1;
		}
		return { type: TokenType.Number, value };
	}

	/** Read a single-character operator or parenthesis. */
	private readSymbol(char: string): Token {
		this.position += 1;
		switch (char) {
			case '+':
				return { type: TokenType.Plus, value: char };
			case '-':
				return { type: TokenType.Minus, value: char };
			case '*':
				return { type: TokenType.Star, value: char };
			case '/':
				return { type: TokenType.Slash, value: char };
			case '(':
				return { type: TokenType.LeftParen, value: char };
			case ')':
				return { type: TokenType.RightParen, value: char };
			default:
				throw new Error(`unexpected character: ${char}`);
		}
	}

	/** Whether a character is an ASCII digit. */
	private static isDigit(char: string): boolean {
		return char >= '0' && char <= '9';
	}
}
