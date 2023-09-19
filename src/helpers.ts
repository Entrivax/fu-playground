// #region JSX Helpers

export type Ref<T> = (value?: T) => T

export function useRef<T>(initialValue: T): Ref<T> {
    let currentValue = initialValue
    return function(value?: T) {
        if (arguments.length > 0) {
            currentValue = value as T
        }
        return currentValue
    }
}

// #endregion JSX Helpers