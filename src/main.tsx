import { h, Frag } from './pragma.js'
import './style.scss'
import { useRef } from './helpers.js'
import * as libFut from '../submodules/fut/libfut.js'
import { conf as fuConf, language as fuLanguage } from './fuLanguageDefinition.js'
import { launchDebugWindow } from './debugWindow.js'

let leftEditor: monaco.editor.IStandaloneCodeEditor
const srcFiles: Record<string, monaco.editor.ITextModel> = {}
let rightEditor: monaco.editor.IStandaloneCodeEditor
const outFiles: Record<string, monaco.editor.ITextModel> = {}
const referenceFiles: string[] = []
let errors: { filename: string, startLine: number, startColumn: number, endLine: number, endColumn: number, message: string }[] = []
let debugEntryPoint: string | null = null

const { onBuildCall, addOnBuildListener } = (() => {
    const listeners: ((fuProgram: libFut.FuProgram | null) => void)[] = []
    return {
        onBuildCall: (fuProgram: libFut.FuProgram | null) => {
            listeners.forEach(l => l(fuProgram))
        },
        addOnBuildListener: (listener: (fuProgram: libFut.FuProgram | null) => void) => {
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
    { name: 'C', value: 'c', getGenerator: () => new libFut.GenC(), macro: 'C' },
    { name: 'OpenCL C', value: 'cl', getGenerator: () => new libFut.GenCl(), macro: 'CL' },
    { name: 'C++', value: 'cpp', getGenerator: () => new libFut.GenCpp(), macro: 'CPP' },
    { name: 'C#', value: 'cs', getGenerator: () => new libFut.GenCs(), macro: 'CSHARP' },
    { name: 'D', value: 'd', getGenerator: () => new libFut.GenD(), macro: 'D' },
    { name: 'Java', value: 'java', getGenerator: () => new libFut.GenJava(), macro: 'JAVA' },
    { name: 'JavaScript', value: 'js', getGenerator: () => new libFut.GenJs(), macro: 'JS' },
    { name: 'Python', value: 'py', getGenerator: () => new libFut.GenPy(), macro: 'PYTHON' },
    { name: 'Swift', value: 'swift', getGenerator: () => new libFut.GenSwift(), macro: 'SWIFT' },
    { name: 'TypeScript', value: 'ts', getGenerator: () => new libFut.GenTs().withGenFullCode(), macro: 'TS' },
    { name: 'TypeScript typings', value: 'd.ts', getGenerator: () => new libFut.GenTs(), macro: 'TSD' },
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
                <select id="target-language" ref={e => targetLanguageSelect = e} onChange={() => { selectedTargetLanguage = targetLanguageSelect.value; deferedBuild() }}>
                    { targetLanguages.map(lang => <option value={lang.value}>{lang.name}</option>) }
                </select>
            </div>
            <div>
                <div class="form-group">
                    <label for="debug-starting-point">Debug starting point</label>
                    <DebugStartingPointSelector  />
                </div>
                <div>
                    <button title="Run the debug starting point in a JavaScript context" onClick={() => runDebug()}>Run Debug</button>
                </div>
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
            <div class="libinfo">
                <a href="https://github.com/fusionlanguage/fut">Fusion language Github</a>
                <div>LibFut version: { window.libfutVersion }</div>
            </div>
        </div>
    </div>
}

function DebugStartingPointSelector() {
    let availableEntryPoints: string[] = []
    const selectRef = <select id="debug-starting-point" onChange={() => {
        if (!selectRef.value || availableEntryPoints.indexOf(selectRef.value) === -1) return
        debugEntryPoint = selectRef.value
    }}></select>
    addOnBuildListener((program) => {
        if (!program) return

        let entryPoints: string[] = []
        ;(program.classes as libFut.FuClass[]).forEach(c => {
            if (c.callType === libFut.FuCallType.STATIC && c.isPublic) {
                for (let fieldName in c.dict) {
                    const field = c.dict[fieldName]
                    if (!(field instanceof libFut.FuMethod)) continue
                    if (field.callType === libFut.FuCallType.STATIC && field.visibility === libFut.FuVisibility.PUBLIC) {
                        entryPoints.push(`${c.name}.${field.name}`)
                    }
                }
            }
        })

        availableEntryPoints = entryPoints

        selectRef.innerHTML = ''
        selectRef.append(...availableEntryPoints.map(entryPoint => <option value={entryPoint}>{entryPoint}</option>))
        selectRef.value = debugEntryPoint && availableEntryPoints.indexOf(debugEntryPoint) !== -1 && debugEntryPoint || null
    })
    return selectRef
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
            let isReferenceFile = referenceFiles.indexOf(path) !== -1
            return <div
                class={"tab" + (isReferenceFile ? " reference-file-tab" : "")}
                data-path={path}
                onClick={() => openTab(path)}
                onContextMenu={(e: MouseEvent) => close = openContextMenu(e, () => <div class="context-menu-items">
                    <div class="context-menu-title">{path}</div>
                    <hr/>
                    <button class="context-menu-action" onClick={() => { close?.(); promptRenameSrc(path) }}>Rename</button>
                    {
                        !isReferenceFile
                            ? <button class="context-menu-action" onClick={() => { close?.(); markAsReferenceFile(path) }}>Set as reference file</button>
                            : <button class="context-menu-action" onClick={() => { close?.(); unmarkAsReferenceFile(path) }}>Set as source file</button>
                    }
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

function runDebug() {
    if (!debugEntryPoint) return
    const parser = new libFut.FuParser();
    const inputFiles = Object.keys(srcFiles);
    const sema = new FileResourceSema();
    let outputFile = `output.js`;
    let namespace = "";
    let files: Record<string, string> = {}
    const host = new FileGenHost((path => {
        files[path] = ''
        return {
            write: (data: Uint8Array | string) => {
                if (typeof data === 'string') {
                    files[path] += data
                    return
                }
                const decoder = new TextDecoder()
                const text = decoder.decode(data)
                files[path] += text
            },
            close: (callback?: () => void) => {
                if (callback) callback()
            },
            delete: () => {
                delete files[path]
            }
        }
    }));
    errors = host.errors
    parser.setHost(host);
    sema.setHost(host);
    parser.addPreSymbol('JS')
    parser.addPreSymbol('DEBUG')
    const system = libFut.FuSystem.new();
    let parent = system;
    let program: libFut.FuProgram | null = null
    try {
        program = parseAndResolve(parser, system, parent, inputFiles, sema, host);
        if (program == null) {
            throw new Error('Failed to parse input files')
        }
        emit(program, new libFut.GenJsNoModule(), namespace, outputFile, host);
    }
    catch (e) {
        console.error(`fut: ERROR: ${(e as Error)?.message || e}`);
    }

    launchDebugWindow(files[outputFile], debugEntryPoint)
}

function markAsReferenceFile(path: string) {
    referenceFiles.push(path)
    onSrcFileUpdateCall()
}

function unmarkAsReferenceFile(path: string) {
    const index = referenceFiles.indexOf(path)
    if (index === -1) {
        return
    }
    referenceFiles.splice(index, 1)
    onSrcFileUpdateCall()
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
    let referenceFileIndex = referenceFiles.indexOf(oldPath)
    if (referenceFileIndex !== -1) {
        referenceFiles.splice(referenceFileIndex, 1, newPath)
    }
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
    const model = monaco.editor.createModel('', undefined, monaco.Uri.file(path))
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

type CreateOutStream = typeof createOutStream

class FileGenHost extends libFut.FuConsoleHost
{
	#currentFile;
    errors: { filename: string, startLine: number, startColumn: number, endLine: number, endColumn: number, message: string }[] = []
    #createOutStream: CreateOutStream

    constructor(createOutStream: CreateOutStream) {
        super()
        this.#createOutStream = createOutStream
    }

	createFile(directory, filename)
	{
		if (directory != null)
			filename = directory ? `${directory}/${filename}` : filename;
		this.#currentFile = this.#createOutStream(filename);
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

function emit(program: libFut.FuProgram, lang: string | libFut.GenBase, namespace: string, outputFile: string, host: libFut.FuConsoleHost)
{
	let gen;
    if (typeof lang === 'string') {
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
    } else {
        gen = lang
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
function getMacroFromLanguage(lang: string) {
    const languageTarget = targetLanguages.find(l => l.value === lang)
    if (!languageTarget) {
        console.error(`fut: ERROR: Unknown target language ${lang}`);
        return;
    }
    return languageTarget.macro
}

function build() {
    disposeOutModels()

    const parser = new libFut.FuParser();
    const inputFiles = Object.keys(srcFiles).filter(f => referenceFiles.indexOf(f) === -1);
    const sema = new FileResourceSema();
    let outputFile = `output.${getExtensionFromLanguage(selectedTargetLanguage)}`;
    let namespace = "";
    const host = new FileGenHost(createOutStream);
    errors = host.errors
    parser.setHost(host);
    sema.setHost(host);
    parser.addPreSymbol(getMacroFromLanguage(selectedTargetLanguage))
    const system = libFut.FuSystem.new();
    let parent = system;
    let program: libFut.FuProgram | null = null
    transpileTry: try {
        if (referenceFiles.length > 0)
            parent = parseAndResolve(parser, system, parent, referenceFiles, sema, host);
        if (parent == null) {
            console.error(`fut: ERROR: Failed to parse referenced files`);
            break transpileTry;
        }
        program = parseAndResolve(parser, system, parent, inputFiles, sema, host);
        if (program == null) {
            console.error(`fut: ERROR: Failed to parse input files`);
            break transpileTry;
        }
        emit(program, selectedTargetLanguage, namespace, outputFile, host);
    }
    catch (e) {
        console.error(`fut: ERROR: ${(e as Error)?.message || e}`);
    }
    onBuildCall(program)
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
    window.monaco.languages.register({ id: 'fusion' })
    monaco.languages.setLanguageConfiguration('fusion', fuConf)
    monaco.languages.setMonarchTokensProvider('fusion', fuLanguage)

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
}

public static class Debug
{
    public static void Run() {
        const int Width = 20;
        const int Height = 30;
        byte[Width * Height * 4] colors;
        Console.WriteLine(HelloFu.GetMessage());
        for (int x = 0; x < Width; x++) {
            for (int y = 0; y < Height; y++) {
                int pxOffset = (x + y * Width) * 4;
                int split = 3 * y / Height;
                // R
                colors[pxOffset] = split == 0 ? 255 : 0;
                // G
                colors[pxOffset + 1] = split == 1 ? 255 : 0;
                // B
                colors[pxOffset + 2] = split == 2 ? 255 : 0;
                // Alpha
                colors[pxOffset + 3] = 255;
            }
        }
        DebugExt.WriteImage(Width, Height, colors);
        DebugExt.WriteColorFromArray(colors, Width * 0);
        DebugExt.WriteColorFromArray(colors, Width * 10);
        DebugExt.WriteColorFromArray(colors, Width * 20);
    }
}`)
        createSrcFile('DebugExt.fu', `public static class DebugExt {
    public static void WriteImage(int width, int height, byte[] imageData) {
#if DEBUG
native {console.log(new window.debugUtils.ImageLog(width, height, imageData)); }
#endif
    }
    public static void WriteColor(string color) {
#if DEBUG
native {console.log(new window.debugUtils.ColorLog(color)); }
#endif
    }
    public static void WriteColorFromArray(byte[] pixels, int pixel) {
#if DEBUG
native {console.log(new window.debugUtils.ColorLog(pixels.slice(pixel * 4, (pixel + 1) * 4))); }
#endif
    }
}`)
        markAsReferenceFile('DebugExt.fu')
        debugEntryPoint = 'Debug.Run'
        openSrcFile('main.fu')
        deferedBuild()
    }, 10)
}