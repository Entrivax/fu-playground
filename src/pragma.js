// #region JSX Pragma

/** @typedef {((props: any, ...children: any[]) => Node) | string} Tag */
/** @typedef {Record<string, string | Function | number | boolean | null | undefined>} Props */
/** @typedef {string | Node} Child */

/**
 * @param {Tag} tag
 * @param {Props} props
 * @param {...Child} children
 * @returns {Node}
 */
export function h(tag, props, ...children) {
    const { ref, ..._props } = props || {}

    if (typeof tag === 'function') {
        return tag({ ref, ...props }, ...children)
    }

    let element;
    let indexOfColon = tag.indexOf(':')
    if (indexOfColon !== -1 && tag.slice(0, indexOfColon) === 'svg') {
        element = document.createElementNS('http://www.w3.org/2000/svg', tag.slice(indexOfColon + 1))
    } else {
        element = document.createElement(tag)
    }

    for (let key of Object.keys(_props)) {
        const propVal = _props[key]
        if (key.startsWith('on')) {
            const capture = key.endsWith('Capture')
            const _key = capture ? key.slice(2, -7) : key.slice(2)
            element.addEventListener(_key.toLowerCase(), /** @type {EventListenerOrEventListenerObject} */(propVal), capture)
        } else if (propVal != null) {
            if (key === 'className') {
                const classes = (propVal.toString(10) || '').trim().split(' ')
                for (let className of classes) {
                    if (className) {
                        element.classList.add(className)
                    }
                }
            } else if (key === 'style') {
                if (typeof propVal === 'object') {
                    for (let styleProp of Object.keys(propVal)) {
                        if (propVal[styleProp]) {
                            element.style.setProperty(styleProp, propVal[styleProp])
                        }
                    }
                } else {
                    element.setAttribute(key, propVal.toString() || '')
                }
            } else if (typeof propVal !== 'boolean' || propVal === true) {
                element.setAttribute(key, propVal.toString() || '')
            }
        }
    }

    const _children = children && children.length > 0 && children.flat().filter(c => c instanceof Node || typeof c === 'string')
    if (_children && _children.length > 0) {
        element.append(..._children)
    }

    if (typeof ref === 'function') {
        ref(element)
    }

    return element
}

/**
 * 
 * @param {Props} props 
 * @param  {...Child} children 
 * @returns {DocumentFragment}
 */
export function Frag(props, ...children){
    const frag = document.createDocumentFragment()

    const _children = children && children.length > 0 && children.flat().filter(c => c instanceof Node || typeof c === 'string')
    if (_children && _children.length > 0) {
        frag.append(..._children)
    }

    return frag
}

// #endregion JSX Pragma
