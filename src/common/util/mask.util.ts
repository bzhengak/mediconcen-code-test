const VISIBLE_PREFIX = 3;
const VISIBLE_SUFFIX = 3;
const SHORT_VALUE_MAX_LENGTH = 8;

/**
 * Business identifiers can trace back to a customer, so they are partly masked wherever they
 * reach the log. Full values stay in MySQL, which is the only place they need to be readable.
 */
export function maskIdentifier(value: string): string {
  if (value.length <= SHORT_VALUE_MAX_LENGTH) {
    return '*'.repeat(value.length);
  }
  const hidden = value.length - VISIBLE_PREFIX - VISIBLE_SUFFIX;
  return `${value.slice(0, VISIBLE_PREFIX)}${'*'.repeat(hidden)}${value.slice(-VISIBLE_SUFFIX)}`;
}
