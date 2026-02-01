import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/main.ts',
  output: {
    file: 'dist/index.cjs',
    format: 'cjs',
    sourcemap: false,
    inlineDynamicImports: true
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      sourceMap: false
    }),
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node']
    }),
    commonjs(),
    json()
  ]
}

export default config
