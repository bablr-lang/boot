import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const esmOutputOptions = {
  file: './dist/esm.bundle.js',
  format: 'esm',
};

const cjsOutputOptions = {
  file: './dist/cjs.bundle.js',
  format: 'cjs',
};

export default {
  input: './lib/index.js',
  plugins: [commonjs(), nodeResolve({ exportConditions: ['node'] })],
  output: [esmOutputOptions, cjsOutputOptions],
};
