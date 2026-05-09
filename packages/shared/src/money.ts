// Money is bigint cents. Never `number`. Never floats.
// Reasoning: directive bans money-as-number. Float arithmetic loses cents at
// scale; bigint is exact. We keep the unit as USD cents throughout the system.

export type Cents = bigint;

export const usd = (dollars: number, cents = 0): Cents =>
  BigInt(Math.round(dollars * 100)) + BigInt(cents);

export const formatUsd = (c: Cents): string => {
  const sign = c < 0n ? "-" : "";
  const abs = c < 0n ? -c : c;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${sign}$${whole.toLocaleString("en-US")}.${frac}`;
};

export const sumCents = (xs: readonly Cents[]): Cents =>
  xs.reduce((a, b) => a + b, 0n);
