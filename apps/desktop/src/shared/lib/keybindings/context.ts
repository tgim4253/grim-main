export type GrimKeybindingContextValue = boolean | number | string | null | undefined;

export type GrimKeybindingContext = Readonly<Record<string, GrimKeybindingContextValue>>;

type WhenToken =
  | { type: 'identifier'; value: string }
  | { type: 'number'; value: number }
  | { type: 'operator'; value: '!' | '&&' | '||' | '>' | '>=' | '<' | '<=' | '==' | '!=' }
  | { type: 'paren'; value: '(' | ')' };

const identifierPattern = /[A-Za-z_]/;
const identifierPartPattern = /[A-Za-z0-9_]/;

type ComparableValue = boolean | number | string | null | undefined;

export function evaluateKeybindingWhen(
  when: string | undefined,
  context: GrimKeybindingContext,
): boolean {
  if (!when?.trim()) {
    return true;
  }

  try {
    const parser = new WhenExpressionParser(tokenizeWhenExpression(when), context);
    return parser.parse();
  } catch {
    return false;
  }
}

function tokenizeWhenExpression(when: string): WhenToken[] {
  const tokens: WhenToken[] = [];
  let index = 0;

  while (index < when.length) {
    const current = when[index];

    if (!current) {
      break;
    }

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    const twoCharacterOperator = when.slice(index, index + 2);
    if (
      twoCharacterOperator === '&&' ||
      twoCharacterOperator === '||' ||
      twoCharacterOperator === '>=' ||
      twoCharacterOperator === '<=' ||
      twoCharacterOperator === '==' ||
      twoCharacterOperator === '!='
    ) {
      tokens.push({ type: 'operator', value: twoCharacterOperator });
      index += 2;
      continue;
    }

    if (current === '!' || current === '>' || current === '<') {
      tokens.push({ type: 'operator', value: current });
      index += 1;
      continue;
    }

    if (current === '(' || current === ')') {
      tokens.push({ type: 'paren', value: current });
      index += 1;
      continue;
    }

    if (/\d/.test(current)) {
      const start = index;
      index += 1;
      while (index < when.length && /[\d.]/.test(when[index] ?? '')) {
        index += 1;
      }
      tokens.push({ type: 'number', value: Number(when.slice(start, index)) });
      continue;
    }

    if (identifierPattern.test(current)) {
      const start = index;
      index += 1;
      while (index < when.length && identifierPartPattern.test(when[index] ?? '')) {
        index += 1;
      }
      tokens.push({ type: 'identifier', value: when.slice(start, index) });
      continue;
    }

    throw new Error(`Unsupported keybinding context token: ${current}`);
  }

  return tokens;
}

class WhenExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: readonly WhenToken[],
    private readonly context: GrimKeybindingContext,
  ) {}

  parse(): boolean {
    const result = this.parseOr();

    if (this.peek()) {
      throw new Error('Unexpected trailing keybinding context tokens.');
    }

    return result;
  }

  private parseOr(): boolean {
    let result = this.parseAnd();

    while (this.matchOperator('||')) {
      const right = this.parseAnd();
      result = result || right;
    }

    return result;
  }

  private parseAnd(): boolean {
    let result = this.parseUnary();

    while (this.matchOperator('&&')) {
      const right = this.parseUnary();
      result = result && right;
    }

    return result;
  }

  private parseUnary(): boolean {
    if (this.matchOperator('!')) {
      return !this.parseUnary();
    }

    return this.parseComparison();
  }

  private parseComparison(): boolean {
    const left = this.parsePrimaryValue();
    const operator = this.matchComparisonOperator();

    if (!operator) {
      return coerceWhenValueToBoolean(left);
    }

    const right = this.parsePrimaryValue();
    return compareWhenValues(left, right, operator);
  }

  private parsePrimaryValue(): ComparableValue {
    const token = this.consume();

    if (!token) {
      throw new Error('Expected keybinding context value.');
    }

    if (token.type === 'identifier') {
      return this.context[token.value];
    }

    if (token.type === 'number') {
      return token.value;
    }

    if (token.type === 'paren' && token.value === '(') {
      const result = this.parseOr();
      const closingToken = this.consume();

      if (closingToken?.type !== 'paren' || closingToken.value !== ')') {
        throw new Error('Expected closing parenthesis in keybinding context.');
      }

      return result;
    }

    throw new Error('Expected keybinding context primary value.');
  }

  private matchComparisonOperator(): Extract<WhenToken, { type: 'operator' }>['value'] | null {
    const token = this.peek();
    if (
      token?.type === 'operator' &&
      (token.value === '>' ||
        token.value === '>=' ||
        token.value === '<' ||
        token.value === '<=' ||
        token.value === '==' ||
        token.value === '!=')
    ) {
      this.index += 1;
      return token.value;
    }

    return null;
  }

  private matchOperator(operator: Extract<WhenToken, { type: 'operator' }>['value']): boolean {
    const token = this.peek();
    if (token?.type === 'operator' && token.value === operator) {
      this.index += 1;
      return true;
    }

    return false;
  }

  private consume(): WhenToken | undefined {
    const token = this.peek();
    if (token) {
      this.index += 1;
    }

    return token;
  }

  private peek(): WhenToken | undefined {
    return this.tokens[this.index];
  }
}

function coerceWhenValueToBoolean(value: ComparableValue): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value === 'string') {
    return value.length > 0;
  }

  return false;
}

function compareWhenValues(
  left: ComparableValue,
  right: ComparableValue,
  operator: Extract<WhenToken, { type: 'operator' }>['value'],
): boolean {
  if (operator === '==' || operator === '!=') {
    const result = left === right;
    return operator === '==' ? result : !result;
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return false;
  }

  switch (operator) {
    case '>':
      return leftNumber > rightNumber;
    case '>=':
      return leftNumber >= rightNumber;
    case '<':
      return leftNumber < rightNumber;
    case '<=':
      return leftNumber <= rightNumber;
    default:
      return false;
  }
}
