const instruction = require('./languages/instruction.js');
const regex = require('./languages/regex.js');
const spamex = require('./languages/spamex.js');

const { TemplateParser } = require('./miniparser.js');

const iId = { language: instruction.name, type: 'Call' };
const spamId = { language: spamex.name, type: 'Expression' };
const reId = { language: regex.name, type: 'Pattern' };

const i = (quasis, ...exprs) => new TemplateParser(instruction, quasis.raw, exprs).eval(iId);
const spam = (quasis, ...exprs) => new TemplateParser(spamex, quasis.raw, exprs).eval(spamId);
const re = (quasis, ...exprs) => new TemplateParser(regex, quasis.raw, exprs).eval(reId);

module.exports = { re, spam, i };
