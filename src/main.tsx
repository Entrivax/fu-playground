import { h, Frag } from './pragma.js'
import './style.scss'
import { useRef } from './helpers.js'
import * as libFut from '../submodules/fut/libfut.js'
// import { loadWASM } from 'onigasm'
// import { Registry } from 'monaco-textmate'
// import * as languageDef from '../submodules/fut/editors/vscode/syntaxes/fusion.tmLanguage.json'
// import { wireTmGrammars } from 'monaco-editor-textmate'

let leftEditor: monaco.editor.IStandaloneCodeEditor
const srcFiles: Record<string, monaco.editor.ITextModel> = {}
let rightEditor: monaco.editor.IStandaloneCodeEditor
const outFiles: Record<string, monaco.editor.ITextModel> = {}

const deferedBuild = defer(() => {
    build()
    openOutFile(Object.keys(outFiles)[0])
}, 500)

function App() {
    const leftEditorContainer = <div class="editor-container"></div>
    const rightEditorContainer = <div class="editor-container"></div>
    setTimeout(() => {
        leftEditor = monaco.editor.create(leftEditorContainer, {
            theme: "vs-dark",
            lineNumbers: 'on',
        })
        leftEditor.onDidChangeModelContent(() => {
            deferedBuild()
        })
        rightEditor = window.monaco.editor.create(rightEditorContainer, {
            theme: "vs-dark",
            lineNumbers: 'on',
            readOnly: true,
            value: ``,
        })
    })

    return <div class="app">
        <div class="editors-columns">
            <div class="editor-column">
                { leftEditorContainer }
            </div>
            <div class="editor-column">
                { rightEditorContainer }
            </div>
        </div>
    </div>
}

function createSrcFile(path: string, content: string) {
    const model = monaco.editor.createModel(content, 'fusion')
    srcFiles[path] = model
}

function openSrcFile(path: string) {
    leftEditor.setModel(srcFiles[path])
}

function openOutFile(path: string) {
    if (!path || !outFiles[path]) return
    rightEditor.setModel(outFiles[path])
}

class FileResourceSema extends libFut.FuSema
{
	#readResource(name, expr)
	{
        if (srcFiles[name]) {
            return new TextEncoder().encode(srcFiles[name].getValue())
        } else {
			this.reportError(expr, `File ${name} not found`);
		}
		return [];
	}

	getResourceLength(name, expr)
	{
		if (this.program.resources.hasOwnProperty(name))
			return this.program.resources[name].length;
		const content = this.#readResource(name, expr);
		this.program.resources[name] = content;
		return content.length;
	}
}

function createOutStream(path: string) {
    const model = monaco.editor.createModel('', '')
    outFiles[path] = model
    let value = ''
    return {
        write: (data: Uint8Array | string) => {
            if (typeof data === 'string') {
                value += data
                return
            }
            const decoder = new TextDecoder()
            const text = decoder.decode(data)
            value += text
        },
        close: (callback?: () => void) => {
            model.setValue(value)
            value = ''
            if (callback) callback()
        },
        delete: () => {
            value = ''
            delete outFiles[path]
        }
    }
}

class FileGenHost extends libFut.FuConsoleHost
{
	#currentFile;

	createFile(directory, filename)
	{
		if (directory != null)
			filename = directory ? `${directory}/${filename}` : filename;
		this.#currentFile = createOutStream(filename);
		return this.#currentFile;
	}

	closeFile()
	{
		if (this.hasErrors) {
			this.#currentFile.close(() => this.#currentFile.delete());
		}
		else
			this.#currentFile.close();
	}
}

function parseAndResolve(parser: libFut.FuParser, system: libFut.FuSystem, parent: libFut.FuSystem | libFut.FuProgram, files: string[], sema: libFut.FuSema, host: libFut.FuConsoleHost)
{
	parser.program = new libFut.FuProgram();
	parser.program.parent = parent;
	parser.program.system = system;
	for (const file of files) {
		const input = new TextEncoder().encode(srcFiles[file].getValue());
		parser.parse(file, input, input.length);
	}
	if (host.hasErrors)
		return null;
	sema.process(parser.program);
	if (host.hasErrors)
        return null;
	return parser.program;
}

function emit(program: libFut.FuProgram, lang: string, namespace: string, outputFile: string, host: libFut.FuConsoleHost)
{
	let gen;
	switch (lang) {
	case "c":
		gen = new libFut.GenC();
		break;
	case "cpp":
		gen = new libFut.GenCpp();
		break;
	case "cs":
		gen = new libFut.GenCs();
		break;
	case "d":
		gen = new libFut.GenD();
		break;
	case "java":
		gen = new libFut.GenJava();
        outputFile = ''
		break;
	case "js":
	case "mjs":
		gen = new libFut.GenJs();
		break;
	case "py":
		gen = new libFut.GenPy();
		break;
	case "swift":
		gen = new libFut.GenSwift();
		break;
	case "ts":
		gen = new libFut.GenTs().withGenFullCode();
		break;
	case "d.ts":
		gen = new libFut.GenTs();
		break;
	case "cl":
		gen = new libFut.GenCl();
		break;
	default:
		console.error(`fut: ERROR: Unknown language: ${lang}`);
		return;
	}
	gen.namespace = namespace;
	gen.outputFile = outputFile;
	gen.setHost(host);
	gen.writeProgram(program);
	if (host.hasErrors) {
		host.hasErrors = false;
	}
}

function disposeOutModels() {
    for (const path in outFiles) {
        outFiles[path].dispose()
        delete outFiles[path]
    }
}

function build() {
    disposeOutModels()

    const parser = new libFut.FuParser();
    const inputFiles = Object.keys(srcFiles);
    const referencedFiles = [];
    const sema = new FileResourceSema();
    let lang = 'js';
    let outputFile = 'output.js';
    let namespace = "";
    const host = new FileGenHost();
    parser.setHost(host);
    sema.setHost(host);
    const system = libFut.FuSystem.new();
    let parent = system;
    try {
        if (referencedFiles.length > 0)
            parent = parseAndResolve(parser, system, parent, referencedFiles, sema, host);
        if (parent == null) {
            console.error(`fut: ERROR: Failed to parse referenced files`);
            return;
        }
        const program = parseAndResolve(parser, system, parent, inputFiles, sema, host);
        if (program == null) {
            console.error(`fut: ERROR: Failed to parse input files`);
            return;
        }
        emit(program, lang, namespace, outputFile, host);
    }
    catch (e) {
        console.error(`fut: ERROR: ${(e as Error)?.message || e}`);
    }
}

function defer(func, delay) {
    let timeoutHandle;
    return function() {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        timeoutHandle = setTimeout(func, delay);
    }
}

export async function main() {
    // await loadWASM('dist/onigasm.wasm')
    // const registry = new Registry({
    //     getGrammarDefinition: async () => {
    //         return {
    //             format: 'json',
    //             content: JSON.stringify(languageDef)
    //         }
    //     }
    // })
    
    // const grammars = new Map()
    // grammars.set('fusion', 'source.fu')
    
    window.monaco.languages.register({ id: 'fusion' })
    // await wireTmGrammars(monaco, registry, grammars)

    document.body.appendChild(
        <App></App>
    )

    setTimeout(() => {

        createSrcFile('main.fu', `public class HelloFu
{
    public static string GetMessage()
    {
        return "Hello, world!";
    }
}`)
        openSrcFile('main.fu')
        deferedBuild()
    }, 10)
}