import { ReferenceTag, GapTag, LiteralTag } from '@bablr/agast-helpers/symbols';

const Trivia = Symbol.for('Trivia');
const Escape = Symbol.for('Escape');

const { freeze, seal } = Object;
const { isArray } = Array;

const freezeSeal = (obj) => freeze(seal(obj));

export const node = (flags, language, type, children = [], properties = {}, attributes = {}) =>
  freezeSeal({
    flags,
    language,
    type,
    children: freezeSeal(children),
    properties: freezeSeal(properties),
    attributes: freezeSeal(attributes),
  });

const stripArray = (val) => {
  if (isArray(val)) {
    if (val.length > 1) {
      throw new Error();
    }
    return val[0];
  } else {
    return val;
  }
};

export const id = (str) => {
  const { 0: language, 1: type } = stripArray(str).split(':');
  return { language, type };
};

export const ref = (path) => {
  if (isArray(path)) {
    const pathIsArray = path[0].endsWith('[]');
    const name = pathIsArray ? path[0].slice(0, -2) : path[0];
    return freezeSeal({ type: ReferenceTag, value: freezeSeal({ name, isArray: pathIsArray }) });
  } else {
    const { name, isArray: pathIsArray } = path;
    return freezeSeal({ type: ReferenceTag, value: freezeSeal({ name, isArray: pathIsArray }) });
  }
};

export const gap = () => freezeSeal({ type: GapTag, value: undefined });

export const lit = (str) => freezeSeal({ type: LiteralTag, value: stripArray(str) });

export const trivia = (str) => freezeSeal({ type: Trivia, value: stripArray(str) });

export const esc = (raw, cooked) => freezeSeal({ type: Escape, value: { raw, cooked } });
