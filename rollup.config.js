import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import scss from 'rollup-plugin-scss';
import { string } from "rollup-plugin-string";
import * as sass from 'sass';
import childProcess from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs';

const configDir = path.dirname(fileURLToPath(import.meta.url))

const config = {
    input: 'src/main.tsx',
    output: {
        file: 'dist/build.js',
        format: 'iife',
        banner: `window.libfutVersion = '${getLibFutPackageVersion()} (${getLibFutCommitHash()})';`,
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
                { src: 'node_modules/monaco-editor/min/vs', dest: 'dist/monaco' }
            ]
        }),
        scss({
            name: 'build.css',
            sass: sass
        }),
        string({
            include: "**/*.ejs",
        })
    ]
};

function getLibFutPackageVersion() {
    return JSON.parse(readFileSync(path.join(configDir, 'submodules/fut/package.json'), { encoding: 'utf8' })).version
}

function getLibFutCommitHash() {
    return childProcess
        .execSync('git rev-parse HEAD', { cwd: path.join(configDir, 'submodules/fut') })
        .toString().trim().slice(0, 7)
}

export default config;