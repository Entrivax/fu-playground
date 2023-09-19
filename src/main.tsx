import { h, Frag } from './pragma.js'
import { useRef } from './helpers.js'
import * as libFut from '../submodules/fut/libfut.js'
// import { loadWASM } from 'onigasm'
// import { Registry } from 'monaco-textmate'
// import * as languageDef from '../submodules/fut/editors/vscode/syntaxes/fusion.tmLanguage.json'
// import { wireTmGrammars } from 'monaco-editor-textmate'

function App() {
    const leftEditorContainer = <div style="width:800px;height:600px;border:1px solid grey"></div>
    const rightEditorContainer = <div style="width:800px;height:600px;border:1px solid grey"></div>
    setTimeout(() => {
        const leftEditor = monaco.editor.create(leftEditorContainer, {
            theme: "vs-dark",
            lineNumbers: 'on',
        })
        const model = monaco.editor.createModel(`public class HelloFu
        {
            public static string GetMessage()
            {
                return "Hello, world!";
            }
        }`, 'fusion')
        leftEditor.setModel(model)
        leftEditor.onDidChangeModelContent(() => {
            
        })
        const rightEditor = window.monaco.editor.create(rightEditorContainer, {
            theme: "vs-dark",
            lineNumbers: 'on',
            readOnly: true,
            value: ``,
        })
    })

    return <div>
        <div>
            { leftEditorContainer }
        </div>
        <div>
            { rightEditorContainer }
        </div>
    </div>
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
}