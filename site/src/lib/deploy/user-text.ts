/**
 * A chat message as the deploy chat passes it around. `fromModel` marks a
 * message that carries the user role only so the model can read it (the intent
 * the assistant wrote when it handed the user over to the deploy chat): its
 * words are the model's, not the user's.
 */
export interface ChatMessage {
  role: string;
  content: string;
  fromModel?: boolean;
}

/**
 * What the user actually typed, oldest first. Anything the model wrote, in any
 * role, is left out: a wallet, a refusal or a choice must come from the user's
 * own words, because acting on a model's guess about them changes who signs.
 */
export function userTypedTexts(messages: readonly ChatMessage[]): string[] {
  return messages.filter((m) => m.role === 'user' && !m.fromModel).map((m) => m.content);
}
