import template from '../node_modules/lodash/template.js'
import previewTemplateString from './templates/preview.ejs'

const previewTemplate = template(previewTemplateString)

export function launchDebugWindow(scriptSource: string, entryPoint: string) {
    const scriptObjectUrl = URL.createObjectURL(new Blob([scriptSource], { type: 'text/javascript' }))
    const indexOfDot = entryPoint.indexOf('.')
    const outHtml = previewTemplate({
        entryPoint: `${entryPoint.slice(0, indexOfDot)}.${convertEntryPointName(entryPoint.slice(indexOfDot + 1))}`,
        objectUrl: scriptObjectUrl
    })
    const htmlObjectUrl = URL.createObjectURL(new Blob([outHtml], { type: 'text/html' }))
    const debugWindow = window.open(htmlObjectUrl, '_blank', 'width=600,height=400')

    if (!debugWindow) {
        throw new Error('Failed to open debug window')
    }

    const interval = setInterval(() => {
        if (debugWindow.closed) {
            clearInterval(interval)
            URL.revokeObjectURL(scriptObjectUrl)
            URL.revokeObjectURL(htmlObjectUrl)
        }
    }, 1000)
}

function convertEntryPointName(name: string) {
    let camelCaseName = name.slice(0, 1).toLowerCase() + name.slice(1)
    switch (name) {
        case "arguments":
        case "await":
        case "catch":
        case "debugger":
        case "delete":
        case "export":
        case "extends":
        case "finally":
        case "function":
        case "implements":
        case "import":
        case "instanceof":
        case "interface":
        case "let":
        case "package":
        case "private":
        case "super":
        case "try":
        case "typeof":
        case "var":
        case "with":
        case "yield":
            camelCaseName += '_'
            break;
        default:
            break;
    }
    return camelCaseName
}