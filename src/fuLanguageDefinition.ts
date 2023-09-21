
export const conf: monaco.languages.LanguageConfiguration = {
    wordPattern:
		/(-?\d*\.\d\w*)|([^\`\~\!\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
	comments: {
		lineComment: '//',
		blockComment: ['/*', '*/']
	},
	brackets: [
		['{', '}'],
		['[', ']'],
		['(', ')']
	],
	autoClosingPairs: [
		{ open: '{', close: '}' },
		{ open: '[', close: ']' },
		{ open: '(', close: ')' },
		{ open: "'", close: "'", notIn: ['string', 'comment'] },
		{ open: '"', close: '"', notIn: ['string', 'comment'] }
	],
	surroundingPairs: [
		{ open: '{', close: '}' },
		{ open: '[', close: ']' },
		{ open: '(', close: ')' },
		{ open: '<', close: '>' },
		{ open: "'", close: "'" },
		{ open: '"', close: '"' }
	]
}

export const language: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: '.fu',
    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '<', close: '>', token: 'delimiter.angle' }
    ],
    keywords: [
		'abstract',
        'assert',
        'base',
        'bool',
        'break',
        'byte',
        'case',
        'class',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'false',
        'float',
        'for',
        'foreach',
        'if',
        'in',
        'int',
        'internal',
        'is',
        'lock',
        'long',
        'native',
        'new',
        'null',
        'override',
        'protected',
        'public',
        'resource',
        'return',
        'sealed',
        'short',
        'static',
        'string',
        'switch',
        'this',
        'throw',
        'throws',
        'true',
        'uint',
        'ushort',
        'virtual',
        'void',
        'when',
        'while',
    ],

	parenFollows: ['catch', 'if', 'for', 'foreach', 'while', 'switch', 'when'],

	operators: [
		'=',
		'??',
		'||',
		'&&',
		'|',
		'^',
		'&',
		'==',
		'!=',
		'<=',
		'>=',
		'<<',
		'+',
		'-',
		'*',
		'/',
		'%',
		'!',
		'~',
		'++',
		'--',
		'+=',
		'-=',
		'*=',
		'/=',
		'%=',
		'&=',
		'|=',
		'^=',
		'<<=',
		'>>=',
		'>>',
		'=>'
	],

	symbols: /[=><!~?:&|+\-*\/\^%]+/,

	// escape sequences
	escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
        root: [
            // identifiers and keywords
			[
				/\@?[a-zA-Z_]\w*/,
				{
					cases: {
						'@keywords': {
							token: 'keyword.$0',
							next: '@qualified'
						},
						'@default': { token: 'identifier', next: '@qualified' }
					}
				}
			],

			// whitespace
			{ include: '@whitespace' },

            // delimiters and operators
			[
				/}/,
				{
					cases: {
						'$S2==interpolatedstring': {
							token: 'string.quote',
							next: '@pop'
						},
						'$S2==litinterpstring': {
							token: 'string.quote',
							next: '@pop'
						},
						'@default': '@brackets'
					}
				}
			],
			[/[{}()\[\]]/, '@brackets'],
			[/[<>](?!@symbols)/, '@brackets'],
			[
				/@symbols/,
				{
					cases: {
						'@operators': 'delimiter',
						'@default': ''
					}
				}
			],

			// numbers
			[/[0-9_]*\.[0-9_]+([eE][\-+]?\d+)?[fFdD]?/, 'number.float'],
			[/0[x][0-9a-fA-F_]+/, 'number.hex'],
			[/0[o][0-7_]+/, 'number.hex'], // octal: use same theme style as hex
			[/0[b][01_]+/, 'number.hex'], // binary: use same theme style as hex
			[/[0-9_]+/, 'number'],

			// delimiter: after number because of .\d floats
			[/[;,.]/, 'delimiter'],

			// strings
			[/"([^"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
			[/"/, { token: 'string.quote', next: '@string' }],
			[/\$\@"/, { token: 'string.quote', next: '@litinterpstring' }],
			[/\@"/, { token: 'string.quote', next: '@litstring' }],
			[/\$"/, { token: 'string.quote', next: '@interpolatedstring' }],

			// characters
			[/'[^\\']'/, 'string'],
			[/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
			[/'/, 'string.invalid']
        ],
		qualified: [
			[
				/[a-zA-Z_][\w]*/,
				{
					cases: {
						'@keywords': { token: 'keyword.$0' },
						'@default': 'identifier'
					}
				}
			],
			[/\./, 'delimiter'],
			['', '', '@pop']
		],

        comment: [
			[/[^\/*]+/, 'comment'],
			// [/\/\*/,    'comment', '@push' ],    // no nested comments :-(
			['\\*/', 'comment', '@pop'],
			[/[\/*]/, 'comment']
		],

		string: [
			[/[^\\"]+/, 'string'],
			[/@escapes/, 'string.escape'],
			[/\\./, 'string.escape.invalid'],
			[/"/, { token: 'string.quote', next: '@pop' }]
		],

		litstring: [
			[/[^"]+/, 'string'],
			[/""/, 'string.escape'],
			[/"/, { token: 'string.quote', next: '@pop' }]
		],

		litinterpstring: [
			[/[^"{]+/, 'string'],
			[/""/, 'string.escape'],
			[/{{/, 'string.escape'],
			[/}}/, 'string.escape'],
			[/{/, { token: 'string.quote', next: 'root.litinterpstring' }],
			[/"/, { token: 'string.quote', next: '@pop' }]
		],

		interpolatedstring: [
			[/[^\\"{]+/, 'string'],
			[/@escapes/, 'string.escape'],
			[/\\./, 'string.escape.invalid'],
			[/{{/, 'string.escape'],
			[/}}/, 'string.escape'],
			[/{/, { token: 'string.quote', next: 'root.interpolatedstring' }],
			[/"/, { token: 'string.quote', next: '@pop' }]
		],

		whitespace: [
			[/^[ \t\v\f]*#((r)|(load))(?=\s)/, 'directive.csx'],
			[/^[ \t\v\f]*#\w.*$/, 'namespace.cpp'],
			[/[ \t\v\f\r\n]+/, ''],
			[/\/\*/, 'comment', '@comment'],
			[/\/\/.*$/, 'comment']
		]
    }
}