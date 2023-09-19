import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import scss from 'rollup-plugin-scss';
import * as sass from 'sass';

const config = {
    input: 'src/main.tsx',
    output: {
        file: 'dist/build.js',
        format: 'iife',
        assetFileNames: '[name][extname]',
        name: 'build'
    },
    plugins: [
        nodeResolve(),
        commonjs(),
        json({ }),
        typescript({ tsconfig: './tsconfig.json', }),
        babel({ babelHelpers: 'bundled', exclude: ['node_modules/**'], extensions: ['.js', '.jsx', '.ts', '.tsx'] }),
        copy({
            targets: [
                { src: 'node_modules/onigasm/lib/onigasm.wasm', dest: 'dist' },
                { src: 'node_modules/monaco-editor/min/vs', dest: 'dist/monaco' }
            ]
        }),
        scss({
            name: 'build.css',
            sass: sass
        })
    ]
};

export default config;