import { useEffect, useRef, useState } from "react";

export type CallbackGroup = {
  /**
   * add callback into the group and return `remove` function
   * @param callback
   */
  add(callback: Function): VoidFunction;
  called(): number;
  /**
   * call all callbacks with specified args
   * @param args
   */
  call(...args: any[]): void;
  /**
   * remove all callbacks
   */
  clear(): void;
  size(): number;
};

export type Payload<T> =
  | T
  | Promise<T>
  | ((context: EffectContext) => T | Promise<T>);

export type Signal<TPayload, TDefaultPayload = TPayload | undefined> = {
  (payload: Payload<TPayload>): void;
  (payload: Payload<TPayload>, noDispose: boolean): void;
  key: string | undefined;
  payload(): TDefaultPayload;
  onEmit(listener: VoidFunction): VoidFunction;
  onLoading(listener: (promise: Promise<void>) => void): VoidFunction;
  onError(listener: (error: any) => void): VoidFunction;
  error(): any;
  cancel(): void;
  async(): Promise<void> | undefined;
  cancelled(): boolean;
  reset(): void;
  reset(removeAllListeners: boolean): void;
};

export type CreateSignal = {
  <T = void>(): Signal<T>;
  <T>(options: SignalOptionsWithPayload<T>): Signal<T, T>;
  <T = void>(options: SignalOptions): Signal<T>;
};

export type SignalList<T = any> = Signal<T> | (Signal<T> | SignalList<T>)[];

export type SignalOptions = {
  key?: string;
  onError?: (error: any) => void;
  onCancel?: VoidFunction;
};

export type SignalOptionsWithPayload<T> = SignalOptions & { payload: T };

export type UseSignalOptions = {
  suspense?: boolean;
  errorBoundary?: boolean;
};

export type AnySignal = Signal<any>;

export type ChainOptions = {};

export type WaitOptions = {
  onError?: (...signal: AnySignal[]) => void;
  onDone?: (...signal: AnySignal[]) => void;
};

export type EffectContext = {
  promise?: CancellablePromise<any>;

  abortController(): AbortController | undefined;

  /**
   * cancel current execution
   */
  cancel(): void;

  /**
   *
   */
  cancelled(): boolean;

  /**
   *
   * @param listener
   */
  onCancel(listener: VoidFunction): VoidFunction;

  /**
   *
   */
  dispose(): void;

  /**
   *
   * @param promise
   */
  when<T>(promise: Promise<T>): Promise<T>;

  /**
   *
   * @param signal
   * @param options
   */
  when<T>(signal: Signal<T>, options?: WaitOptions): Promise<T>;

  /**
   *
   * @param signals
   * @param options
   */
  all<T extends Record<string, AnySignal | Promise<any>>>(
    signals: T,
    options?: WaitOptions
  ): Promise<{
    [key in keyof T]: T[key] extends Promise<infer V> ? Signal<V, V> : T[key];
  }>;

  /**
   *
   * @param signal
   * @param callback
   */
  on<T extends AnySignal>(
    signal: T,
    callback: (signal: T) => void
  ): VoidFunction;

  /**
   *
   * @param signals
   * @param callback
   */
  on(signals: SignalList, callback: (signal: AnySignal) => void): VoidFunction;

  /**
   *
   * @param signals
   * @param options
   */
  race<T extends Record<string, AnySignal | Promise<any>>>(
    signals: T,
    options?: WaitOptions
  ): Promise<
    Partial<{
      [key in keyof T]: T[key] extends Promise<infer V> ? Signal<V, V> : T[key];
    }>
  >;

  /**
   *
   * @param fn
   * @param args
   */
  call<A extends any[], R>(
    fn: (context: EffectContext, ...args: A) => R,
    ...args: A
  ): R;

  /**
   * create a promise that awaits signal chain
   * @param signals
   */
  chain(signals: ChainItem[]): Promise<AnySignal>;

  /**
   *
   * @param effect
   * @param args
   */
  fork<T, A extends any[]>(
    effect: (
      context: EffectContext,
      ...args: A
    ) => Exclude<Payload<T>, Function>,
    ...args: A
  ): Signal<T>;

  /**
   *
   * @param payload
   */
  fork<T>(payload: Exclude<Payload<T>, Function>): Signal<T>;
};

export type CancellablePromise<T = unknown> = Promise<T> & { cancel(): void };

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type ChainItemResult = AnySignal | SignalList | void | "restart";

export type ChainItem =
  | AnySignal
  | SignalList
  | ((prev: AnySignal) => ChainItemResult | Promise<ChainItemResult>);

const signalType = {};

export const isSignal = <T = any>(value: any): value is Signal<T> => {
  return value && value.$$type === signalType;
};

export const isPromiseLike = <T>(value: any): value is Promise<T> => {
  return value && typeof value.then === "function";
};

const createCallbackGroup = (): CallbackGroup => {
  const callbacks: Function[] = [];
  let called = 0;

  return {
    size: () => callbacks.length,
    called: () => called,
    add(callback: Function) {
      callbacks.push(callback);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
      };
    },
    clear() {
      callbacks.length = 0;
    },
    call(...args: any[]) {
      // optimize performance
      if (args.length > 2) {
        callbacks.slice().forEach((callback) => callback(...args));
      } else if (args.length === 2) {
        callbacks.slice().forEach((callback) => callback(args[0], args[1]));
      } else if (args.length === 1) {
        callbacks.slice().forEach((callback) => callback(args[0]));
      } else {
        callbacks.slice().forEach((callback) => callback());
      }
    },
  };
};

const forEachSignal = (
  signals: SignalList,
  callback: (signal: AnySignal) => void
) => {
  if (Array.isArray(signals)) {
    signals.forEach((x) => forEachSignal(x, callback));
  } else {
    callback(signals);
  }
};

export const delay = <T>(ms: number = 0, value?: T): CancellablePromise<T> => {
  let timer: any;

  return Object.assign(
    new Promise<T>((resolve) => (timer = setTimeout(resolve, ms, value))),
    { cancel: () => clearTimeout(timer) }
  );
};

const isAbortControllerSupported = typeof AbortController !== "undefined";

const createSignalContext = (): EffectContext => {
  let cancelled = false;
  let abortController: AbortController | undefined;
  const onCancel = createCallbackGroup();
  const onDispose = createCallbackGroup();

  const wait = (race: boolean, awaitables: any, options?: WaitOptions) => {
    return new Promise<any>((resolve, reject) => {
      let doneCount = 0;
      let done = false;
      const cleanup = createCallbackGroup();
      const signalList: AnySignal[] = [];
      const result: Record<string, AnySignal> = {};
      // remove onDispose listener
      cleanup.add(
        // remove all signal listeners when context is disposed
        onDispose.add(cleanup.call)
      );

      const onDone = (key: string, signal: AnySignal) => {
        if (done) return;
        const error = signal.error();
        if (error) {
          options?.onDone?.(...signalList);
          options?.onError?.(...signalList);
          cleanup.call();
          return reject(error);
        }
        result[key] = signal;
        doneCount++;
        if (race || doneCount === signalList.length) {
          done = true;
          cleanup.call();
          options?.onDone?.(...signalList);
          resolve(result);
        }
      };
      Object.keys(awaitables).forEach((key) => {
        const awaitable = awaitables[key];
        let s: AnySignal;
        if (isPromiseLike(awaitable)) {
          s = signal();
          s(awaitable);
        } else {
          s = awaitable;
        }
        signalList.push(s);
        cleanup.add(s.onEmit(() => onDone(key, s)));
        cleanup.add(s.onError(() => onDone(key, s)));
      });
    });
  };

  const context: EffectContext = {
    abortController() {
      if (isAbortControllerSupported && !abortController) {
        abortController = new AbortController();
      }
      return abortController;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      abortController?.abort();
      context.promise?.cancel();
      onCancel.call();
      onDispose.call();
    },
    cancelled() {
      return cancelled;
    },
    onCancel(listener) {
      return onCancel.add(listener);
    },
    all(signals, options) {
      return wait(false, signals, options);
    },
    on(singals: SignalList, onEmit: Function) {
      const cleanup = createCallbackGroup();
      cleanup.add(onDispose.add(cleanup.call));
      forEachSignal(singals, (signal) => {
        signal.onEmit(() => onEmit(signal));
      });
      return cleanup.call;
    },
    when(awaitable, options?) {
      let s: AnySignal;
      if (isPromiseLike(awaitable)) {
        s = signal() as AnySignal;
        s(awaitable);
        awaitable = s;
      } else {
        s = awaitable;
      }
      return wait(true, { awaitable }, options as WaitOptions).then(() =>
        s.payload()
      ) as any;
    },
    race(signals, options) {
      return wait(true, signals, options);
    },
    call(fn, ...args) {
      return fn(context, ...args);
    },
    fork(payload: Payload<any>, ...args: any[]) {
      const newSignal = signal<any>();
      onDispose.add(newSignal.cancel);
      newSignal(
        typeof payload === "function"
          ? (context: EffectContext) => (payload as Function)(context, ...args)
          : payload
      );
      return newSignal;
    },
    chain(inputEntries) {
      return new Promise((resolve, reject) => {
        let cleanup: CallbackGroup | undefined;
        let entries = inputEntries.slice();

        const handleError = (error: any) => {
          cleanup?.call();
          reject(error);
        };

        const handleNext = async (prevSignal?: AnySignal) => {
          cleanup?.call();

          if (!entries.length) {
            resolve(prevSignal as AnySignal);
            return;
          }

          const entry = entries.shift();
          const signals =
            typeof entry === "function" && !isSignal(entry)
              ? await entry(prevSignal as AnySignal)
              : entry;
          if (signals === "restart") {
            entries = inputEntries.slice();
            handleNext();
            return;
          }

          if (!signals) {
            resolve(prevSignal as AnySignal);
            return;
          }

          cleanup = createCallbackGroup();
          // remove onDispose listener
          cleanup.add(
            // remove all listeners when context is disposed
            onDispose.add(cleanup.call)
          );

          forEachSignal(signals as SignalList, (signal) => {
            cleanup?.add(signal.onEmit(() => handleNext(signal)));
            cleanup?.add(signal.onError(handleError));
          });
        };

        handleNext();
      });
    },
    dispose() {
      onDispose.call();
    },
  };

  return context;
};

/**
 *
 * @param payload
 * @param args
 * @returns
 */
export const spawn = <T, A extends any[]>(
  payload: (
    context: EffectContext,
    ...args: A
  ) => Exclude<Payload<T>, Function>,
  ...args: A
): Signal<T> => {
  const newSignal = signal<T>();
  newSignal((context) => payload(context, ...args), true);
  return newSignal;
};

export const cancelAll = (...signals: AnySignal[]) => {
  signals.forEach((signal) => {
    signal.cancel();
  });
};

const noop = () => {};

export const signal: CreateSignal = (
  options: SignalOptions = {}
): AnySignal => {
  const defaultPayload = (options as SignalOptionsWithPayload<any>).payload;
  let lastContext: EffectContext | undefined;
  let cancelled = false;
  let payload = defaultPayload;
  let error: any;
  const onError = createCallbackGroup();
  const onEmit = createCallbackGroup();
  const onLoading = createCallbackGroup();

  if (options?.onError) {
    onError.add(options.onError);
  }

  return Object.assign(
    (nextPayload?: Payload<any>, noDispose: boolean = false): any => {
      if (typeof nextPayload !== "function") {
        const p = nextPayload;
        nextPayload = () => p;
      }
      cancelled = false;
      error = undefined;
      lastContext = undefined;
      const context = createSignalContext();
      try {
        const result = (nextPayload as Function)(context);
        if (result === false) return;
        if (isPromiseLike(result)) {
          lastContext = context;
          const promise = Object.assign(
            new Promise<void>((resolve, reject) => {
              result
                .then((value) => {
                  if (lastContext !== context) return;
                  payload = value;
                  lastContext = undefined;
                  context.dispose();
                  onEmit.call();
                  resolve(payload);
                })
                .catch((reason) => {
                  if (lastContext !== context) return;
                  lastContext = undefined;
                  error = reason;
                  !noDispose && context.dispose();
                  onError.call(reason);
                  reject(reason);
                });
            }),
            {
              cancel() {
                (result as CancellablePromise)?.cancel?.();
              },
            }
          );
          promise.catch(noop);
          context.promise = promise;
          onLoading.call(promise);
          return promise;
        }
        payload = result;
        !noDispose && context.dispose();
        onEmit.call();
      } catch (ex) {
        error = ex;
        !noDispose && context.dispose();
        onError.call(ex);
      }
    },
    {
      $$type: signalType,
      key: options?.key,
      onEmit: onEmit.add,
      onError: onError.add,
      onLoading: onLoading.add,
      payload: () => payload,
      error: () => error,
      async: () => lastContext?.promise,
      reset(removeAllListeners = false) {
        error = undefined;
        lastContext = undefined;
        cancelled = false;
        payload = defaultPayload;

        if (removeAllListeners) {
          onEmit.clear();
          onError.clear();
          onLoading.clear();
        }
        onEmit.call();
      },
      cancel() {
        if (!lastContext) return;
        lastContext.cancel();
        error = undefined;
        lastContext = undefined;
        cancelled = true;
        options?.onCancel?.();
      },
      cancelled: () => cancelled,
    }
  ) as unknown as AnySignal;
};

export const useSignal = (
  signals: SignalList,
  { suspense = true, errorBoundary = true }: UseSignalOptions = {}
) => {
  const rerender = useState<any>()[1];
  const optionsRef = useRef<UseSignalOptions>({});
  optionsRef.current = { suspense, errorBoundary };

  const ref = useState(() => {
    let rendering = false;
    const onDispose = createCallbackGroup();
    const registered = new Set<AnySignal>();
    const handleChange = () => {
      if (rendering) return;
      rerender({});
    };
    const registerSignal = (signals: SignalList) => {
      forEachSignal(signals, (signal) => {
        if (registered.has(signal)) return;
        registered.add(signal);
        onDispose.add(signal.onLoading(handleChange));
        onDispose.add(signal.onError(handleChange));
        onDispose.add(signal.onEmit(handleChange));
      });
    };
    return {
      registerSignal,
      setIsRendering(value: boolean) {
        rendering = value;
      },
      dispose() {
        registered.clear();
        onDispose.call();
      },
    };
  })[0];

  ref.setIsRendering(true);

  useEffect(() => {
    ref.setIsRendering(false);
    ref.registerSignal(signals);
  });

  useEffect(() => ref.dispose, [ref]);

  if (suspense || errorBoundary) {
    forEachSignal(signals, (signal) => {
      if (errorBoundary && signal.error()) {
        throw signal.error();
      }
      if (suspense) {
        const promise = signal.async();
        if (promise) throw promise;
      }
    });
  }
};
