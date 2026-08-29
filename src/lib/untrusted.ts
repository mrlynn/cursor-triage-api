/**
 * The trust boundary: a customer message is data.
 *
 * wrapUntrusted escapes `<` so the customer cannot close the delimiter tag.
 * This is the same idea as HTML escaping. It does not make the model immune
 * to persuasion. The refund ceilings in authority.ts are what make the
 * boundary matter for money.
 */
export function wrapUntrusted(text: string, tag = "customer_message"): string {
  const escaped = text.replace(/</g, "&lt;");
  return `<${tag}>\n${escaped}\n</${tag}>`;
}
