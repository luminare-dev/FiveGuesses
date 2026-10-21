import { createElement, Fragment, type ReactNode } from 'react';
import { en } from './en';

export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;

// A placeholder is a single-brace lower-case name: {puzzle}, {seconds}, {studio}.
const PLACEHOLDER = /\{([a-z]+)\}/g;

const hasOwn = (object: object, name: string): boolean => Object.prototype.hasOwnProperty.call(object, name);

// Returns the message with every placeholder replaced by its parameter. A placeholder without a
// parameter stays in the text, so a missing value is visible instead of silently dropped.
export function t(key: MessageKey, params: MessageParams = {}): string {
  return en[key].replace(PLACEHOLDER, (match: string, name: string) =>
    hasOwn(params, name) ? String(params[name]) : match
  );
}

// Splits the message on its placeholders and puts a React node into each slot, for the two
// sentences that carry a link in the middle. Text parts stay strings; a slot without a node stays
// as its placeholder text.
export function tNodes(key: MessageKey, slots: Record<string, ReactNode>): ReactNode[] {
  const message: string = en[key];
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of message.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(message.slice(last, index));
    const name = match[1];
    nodes.push(hasOwn(slots, name) ? createElement(Fragment, { key: nodes.length }, slots[name]) : match[0]);
    last = index + match[0].length;
  }
  if (last < message.length) nodes.push(message.slice(last));
  return nodes;
}
