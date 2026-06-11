/** The kind of a lexical token. */
export enum TokenType {
	Number = 'Number',
	Plus = 'Plus',
	Minus = 'Minus',
	Star = 'Star',
	Slash = 'Slash',
	LeftParen = 'LeftParen',
	RightParen = 'RightParen',
	End = 'End',
}

/** A single lexical token with its raw source value. */
export type Token = {
	type: TokenType;
	value: string;
};
