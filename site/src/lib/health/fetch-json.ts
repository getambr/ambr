/**
 * Reading a JSON answer for the health probes. A reply that is not JSON (an HTML
 * error page, a gateway message) is a different fault from a network failure, and
 * the report should say so. Only the HTTP status number travels with the error:
 * the body and the parser's own message can repeat what was sent.
 */
export class NonJsonAnswer extends Error {
  readonly httpStatus: number;
  constructor(httpStatus: number) {
    super('non-JSON answer');
    this.name = 'NonJsonAnswer';
    this.httpStatus = httpStatus;
  }
}

export function validHttpStatus(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 599;
}

/** Parses the body as JSON. A parse failure becomes a NonJsonAnswer; a stalled or aborted body read is left as it is, so it still counts as a timeout. */
export async function readJson<T>(res: { status: number; json: () => Promise<T> }): Promise<T> {
  try {
    return await res.json();
  } catch (e) {
    if (e instanceof SyntaxError) throw new NonJsonAnswer(res.status);
    throw e;
  }
}
