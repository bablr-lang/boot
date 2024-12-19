// const {cst} = require("@bablr/boot")

// // cst`<Node b={ balancedSpan: true balancer: "}" } />`
// cst`<Node b=[8, 4] />`

/* global console */

const { parse, getAgASTValue } = require('./lib/index.js');

const instruction = require('./lib/languages/cstml.js');
const { printPrettyCSTML } = require('./lib/print.js');

Error.stackTraceLimit = 30;

const source = `<Node b={ Number: NaN } />`;

console.log(printPrettyCSTML(getAgASTValue(instruction, parse(instruction, 'Node', source))));
