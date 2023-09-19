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

const { onBuildCall, addOnBuildListener } = (() => {
    const listeners: (() => void)[] = []
    return {
        onBuildCall: () => {
            listeners.forEach(l => l())
        },
        addOnBuildListener: (listener: () => void) => {
            listeners.push(listener)
        }
    }
})();
const { onRightModelChangeCall, addOnRightModeChangelListener } = (() => {
    const listeners: ((model: monaco.editor.ITextModel, path: string) => void)[] = []
    return {
        onRightModelChangeCall: (model: monaco.editor.ITextModel, path: string) => {
            listeners.forEach(l => l(model, path))
        },
        addOnRightModeChangelListener: (listener: (model: monaco.editor.ITextModel, path: string) => void) => {
            listeners.push(listener)
        }
    }
})();

const deferedBuild = defer(() => {
    build()
    let files = Object.keys(outFiles)
    if (files.indexOf(previousOpenedTargetFile) === -1) {
        openOutFile(files[0])
    } else {
        openOutFile(previousOpenedTargetFile)
    }
}, 500)

const targetLanguages = [
    { name: 'C', value: 'c', getGenerator: () => new libFut.GenC() },
    { name: 'OpenCL C', value: 'cl', getGenerator: () => new libFut.GenCl() },
    { name: 'C++', value: 'cpp', getGenerator: () => new libFut.GenCpp() },
    { name: 'C#', value: 'cs', getGenerator: () => new libFut.GenCs() },
    { name: 'D', value: 'd', getGenerator: () => new libFut.GenD() },
    { name: 'Java', value: 'java', getGenerator: () => new libFut.GenJava() },
    { name: 'JavaScript', value: 'js', getGenerator: () => new libFut.GenJs() },
    { name: 'Python', value: 'py', getGenerator: () => new libFut.GenPy() },
    { name: 'Swift', value: 'swift', getGenerator: () => new libFut.GenSwift() },
    { name: 'TypeScript', value: 'ts', getGenerator: () => new libFut.GenTs().withGenFullCode() },
    { name: 'TypeScript typings', value: 'd.ts', getGenerator: () => new libFut.GenTs() },
]

let selectedTargetLanguage = targetLanguages[0].value
let previousOpenedTargetFile = ''

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

    let targetLanguageSelect: HTMLSelectElement

    return <div class="app">
        <div>
            <div class="form-group">
                <label for="target-language">Target language</label>
                <select ref={e => targetLanguageSelect = e} onChange={() => { selectedTargetLanguage = targetLanguageSelect.value; deferedBuild() }}>
                    { targetLanguages.map(lang => <option value={lang.value}>{lang.name}</option>) }
                </select>
            </div>

        </div>
        <div class="editors-columns">
            <div class="editor-column">
                { leftEditorContainer }
            </div>
            <div class="editor-column">
                <TabSelector />
                { rightEditorContainer }
            </div>
        </div>
    </div>
}

function TabSelector() {
    let tabsRef: HTMLDivElement = <div class="tab-selector"></div>
    function openTab(path: string) {
        openOutFile(path)
    }
    addOnBuildListener(() => {
        tabsRef.innerHTML = ''
        tabsRef.append(...Object.keys(outFiles).map(path => <div class={"tab"} data-path={path} onClick={() => openTab(path)}>{path}</div>))
    })
    addOnRightModeChangelListener((model, path) => {
        tabsRef.querySelectorAll('.tab').forEach(tab => tab.getAttribute('data-path') === path ? tab.classList.add('active') : tab.classList.remove('active'))
    })
    return tabsRef
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
    previousOpenedTargetFile = path
    rightEditor.setModel(outFiles[path])
    onRightModelChangeCall(outFiles[path], path)
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
	case "java":
        outputFile = ''
		break;
	}
    const languageTarget = targetLanguages.find(l => l.value === lang)
    if (!languageTarget) {
        console.error(`fut: ERROR: Unknown target language ${lang}`);
        return;
    }
    gen = languageTarget.getGenerator()
	gen.namespace = namespace;
	gen.outputFile = outputFile;
	gen.setHost(host);
	gen.writeProgram(program);
	if (host.hasErrors) {
		host.hasErrors = false;
	}
}

function disposeOutModels() {
    for (const path of Object.keys(outFiles)) {
        outFiles[path].dispose()
        delete outFiles[path]
    }
}

function getExtensionFromLanguage(lang: string) {
    const languageTarget = targetLanguages.find(l => l.value === lang)
    if (!languageTarget) {
        console.error(`fut: ERROR: Unknown target language ${lang}`);
        return;
    }
    return languageTarget.value
}

function build() {
    disposeOutModels()

    const parser = new libFut.FuParser();
    const inputFiles = Object.keys(srcFiles);
    const referencedFiles = [];
    const sema = new FileResourceSema();
    let outputFile = `output.${getExtensionFromLanguage(selectedTargetLanguage)}`;
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
        emit(program, selectedTargetLanguage, namespace, outputFile, host);
    }
    catch (e) {
        console.error(`fut: ERROR: ${(e as Error)?.message || e}`);
    }
    onBuildCall()
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