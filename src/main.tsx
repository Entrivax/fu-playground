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
let errors: { filename: string, startLine: number, startColumn: number, endLine: number, endColumn: number, message: string }[] = []

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
const { onSrcFileUpdateCall, addOnSrcFileUpdateListener } = (() => {
    const listeners: (() => void)[] = []
    return {
        onSrcFileUpdateCall: () => {
            listeners.forEach(l => l())
        },
        addOnSrcFileUpdateListener: (listener: () => void) => {
            listeners.push(listener)
        }
    }
})();
const { onLeftModelChangeCall, addOnLeftModeChangelListener } = (() => {
    const listeners: ((path: string | null) => void)[] = []
    return {
        onLeftModelChangeCall: (path: string | null) => {
            listeners.forEach(l => l(path))
        },
        addOnLeftModeChangelListener: (listener: (path: string | null) => void) => {
            listeners.push(listener)
        }
    }
})();
const { onRightModelChangeCall, addOnRightModeChangelListener } = (() => {
    const listeners: ((path: string) => void)[] = []
    return {
        onRightModelChangeCall: (path: string) => {
            listeners.forEach(l => l(path))
        },
        addOnRightModeChangelListener: (listener: (path: string) => void) => {
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

addOnSrcFileUpdateListener(() => {
    deferedBuild()
})

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
let previousOpenedSourceFile: string | null = ''
let previousOpenedTargetFile = ''

function App() {
    const leftEditorContainer = <div class="editor-container"></div>
    const rightEditorContainer = <div class="editor-container"></div>
    leftEditor = monaco.editor.create(leftEditorContainer, {
        theme: "vs-dark",
        lineNumbers: 'on',
        automaticLayout: true
    })
    leftEditor.onDidChangeModelContent(() => {
        deferedBuild()
    })
    rightEditor = window.monaco.editor.create(rightEditorContainer, {
        theme: "vs-dark",
        lineNumbers: 'on',
        readOnly: true,
        value: ``,
        automaticLayout: true
    })

    let targetLanguageSelect: HTMLSelectElement

    return <div class="app">
        <Banner />
        <div class="settings">
            <div class="form-group">
                <label for="target-language">Target language</label>
                <select ref={e => targetLanguageSelect = e} onChange={() => { selectedTargetLanguage = targetLanguageSelect.value; deferedBuild() }}>
                    { targetLanguages.map(lang => <option value={lang.value}>{lang.name}</option>) }
                </select>
            </div>
        </div>
        <div class="editors-columns">
            <div class="editor-column">
                <SrcTabSelector />
                { leftEditorContainer }
            </div>
            <div class="editor-column">
                <TabSelector />
                <ErrorsReporter />
                { rightEditorContainer }
            </div>
        </div>
    </div>
}

function Banner() {
    return <div class="banner">
        <div class="banner-left">
            <h1 class="banner-title">Fusion Playground</h1>
        </div>
        <div class="banner-right">
            <a href="https://github.com/fusionlanguage/fut">Fusion language Github</a>
        </div>
    </div>
}

function ErrorsReporter() {
    let errorsRef: HTMLDivElement = <div class="errors-container"></div>
    addOnBuildListener(() => {
        errorsRef.innerHTML = ''
        if (errors.length === 0) {
            return
        }
        errorsRef.append(<div class="errors">
            { errors.map(error => <button class="error" onClick={() => {
                openSrcFile(error.filename)
                leftEditor.setSelection(new monaco.Selection(error.startLine, error.startColumn, error.endLine, error.endColumn))
                leftEditor.focus()
            }}>{ error.filename }({ error.startLine.toString(10) }:{ error.startColumn.toString(10) }): { error.message }</button>) }
        </div>)
    })

    return errorsRef
}

function SrcTabSelector() {
    let tabsRef: HTMLDivElement = <div class="tab-selector"></div>
    function openTab(path: string) {
        openSrcFile(path)
    }
    addOnSrcFileUpdateListener(() => {
        tabsRef.innerHTML = ''
        tabsRef.append(...Object.keys(srcFiles).map(path => {
            let close: (() => void) | null = null
            return <div
                class="tab"
                data-path={path}
                onClick={() => openTab(path)}
                onContextMenu={(e: MouseEvent) => close = openContextMenu(e, () => <div class="context-menu-items">
                    <div class="context-menu-title">{path}</div>
                    <hr/>
                    <button class="context-menu-action" onClick={() => { close?.(); promptRenameSrc(path) }}>Rename</button>
                    <button class="context-menu-action" onClick={() => { close?.(); removeSrcFile(path) }}>Delete</button>
                </div>)}
            >{path}</div>
        }))
        tabsRef.append(<div class="tab" onClick={() => addNewSrcFile()}>+</div>)
        updateSelected(previousOpenedSourceFile)
    })
    addOnLeftModeChangelListener((path) => {
        updateSelected(path)
    })

    function updateSelected(path) {
        tabsRef.querySelectorAll('.tab').forEach(tab => tab.getAttribute('data-path') === path ? tab.classList.add('active') : tab.classList.remove('active'))
    }
    return tabsRef
}

function addNewSrcFile() {
    let newFileTemplate = (i: number) => i === 0 ? `new_file.fu` : `new_file_${i}.fu`
    let i = 0
    let currentFileName: string
    while (srcFiles[currentFileName = newFileTemplate(i)]) {
        i++
    }
    createSrcFile(currentFileName, '')
}

function TabSelector() {
    let tabsRef: HTMLDivElement = <div class="tab-selector"></div>
    function openTab(path: string) {
        openOutFile(path)
    }
    addOnBuildListener(() => {
        tabsRef.innerHTML = ''
        tabsRef.append(...Object.keys(outFiles).map(path => <div class="tab" data-path={path} onClick={() => openTab(path)}>{path}</div>))
        updateSelected(previousOpenedTargetFile)
    })
    addOnRightModeChangelListener((path) => {
        updateSelected(path)
    })

    function updateSelected(path) {
        tabsRef.querySelectorAll('.tab').forEach(tab => tab.getAttribute('data-path') === path ? tab.classList.add('active') : tab.classList.remove('active'))
    }
    return tabsRef
}

function createSrcFile(path: string, content: string) {
    const model = monaco.editor.createModel(content, 'fusion')
    srcFiles[path] = model
    openSrcFile(path)
    onSrcFileUpdateCall()
}

function removeSrcFile(path: string) {
    if (!srcFiles[path]) {
        return
    }
    if (previousOpenedSourceFile === path) {
        const files = Object.keys(srcFiles)
        const index = files.indexOf(path)
        if (index < files.length - 1) {
            openSrcFile(files[index + 1])
        } else if (index > 0) {
            openSrcFile(files[index - 1])
        } else {
            openSrcFile(null)
        }
    }
    srcFiles[path].dispose()
    delete srcFiles[path]
    onSrcFileUpdateCall()
}

function promptRenameSrc(path: string) {
    const result = prompt(`Rename file "${path}"`, path.slice(0, path.lastIndexOf('.')))
    if (!result) {
        return
    }
    const newPath = `${result}.fu`
    renameSrcFile(path, newPath)
}

function renameSrcFile(oldPath: string, newPath: string) {
    if (!srcFiles[oldPath]) {
        return
    }
    srcFiles[newPath] = srcFiles[oldPath]
    delete srcFiles[oldPath]
    if (previousOpenedSourceFile === oldPath) {
        openSrcFile(newPath)
    }
    onSrcFileUpdateCall()
}

function openContextMenu(e: MouseEvent, content: () => Node) {
    e.preventDefault()
    e.stopPropagation()
    const contextMenu = <div class="context-menu" style={{ left: `${e.clientX}px`, top: `${e.clientY}px` }}>{ content() }</div>
    document.body.appendChild(contextMenu)
    const close = () => {
        document.removeEventListener('click', documentClickHandler)
        contextMenu.parentElement?.removeChild(contextMenu)
    }
    const documentClickHandler = (e: MouseEvent) => {
        if (contextMenu.contains(e.target as Node)) {
            return
        }
        e.preventDefault()
        e.stopPropagation()
        close()
    }
    document.addEventListener('click', documentClickHandler)
    return close
}

function openSrcFile(path: string | null) {
    if (path != null && !srcFiles[path]) return
    const model = path == null ? null : srcFiles[path]
    leftEditor.setModel(model)
    previousOpenedSourceFile = path
    onLeftModelChangeCall(path)
}

function openOutFile(path: string) {
    if (!path || !outFiles[path]) return
    previousOpenedTargetFile = path
    rightEditor.setModel(outFiles[path])
    onRightModelChangeCall(path)
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
    errors: { filename: string, startLine: number, startColumn: number, endLine: number, endColumn: number, message: string }[] = []

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

    reportError(filename, startLine, startColumn, endLine, endColumn, message) {
        super.reportError(filename, startLine, startColumn, endLine, endColumn, message)
        this.errors.push({ filename, startLine, startColumn, endLine, endColumn, message })
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
    errors = host.errors
    parser.setHost(host);
    sema.setHost(host);
    const system = libFut.FuSystem.new();
    let parent = system;
    transpileTry: try {
        if (referencedFiles.length > 0)
            parent = parseAndResolve(parser, system, parent, referencedFiles, sema, host);
        if (parent == null) {
            console.error(`fut: ERROR: Failed to parse referenced files`);
            break transpileTry;
        }
        const program = parseAndResolve(parser, system, parent, inputFiles, sema, host);
        if (program == null) {
            console.error(`fut: ERROR: Failed to parse input files`);
            break transpileTry;
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