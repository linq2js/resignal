- [`[Re]act [Signal]`](#react-signal)
  - [Installation](#installation)
  - [Motivation](#motivation)

# `[R]eact [Signal]`

A React lib for controlling app flow

## Installation

**with NPM**

```bash
npm i rsignal --save
```

**with YARN**

```bash
yarn add rsignal
```

## Motivation

This library is inspired by Redux Saga. `rsignal` does not require any state management. You can manage the state of application manually. A heart of rsignal is `signal`.

Creating a signal is very simple

```js
import { signal, delay } from "rsignal";

// create a signal
const greetingSignal = signal();

// handle signal emitting
greetingSignal.onEmit(() => {
  alert(`Hello ${greetingSignal.payload()}`);
});

// emit greetingSignal with payload
greetingSignal("World"); // an alert will shows `Hello World`

let count = 0;
const incrementSignal = signal();

// handle increment
incrementSignal.onEmit(() => {
  alert(count);
});

const increment = () => {
  // emit incrementSignal with update effect
  incrementSignal(() => {
    count++;
    // after exiting the effect, incrementSignal will be emitted
  });
};

const incrementAsync = () => {
  // even we can emit signal with async effect
  incrementSignal(async () => {
    await delay(1000);
    count++;
  });
};

// consume the signal with React component
const CounterApp = () => {
  // the CounterApp will re-render whenever incrementSignal is emitted
  useSignal(incrementSignal);

  return (
    <>
      {/* render latest value of count */}
      <h1>{count}</h1>
      <button onClick={increment}>Increment</button>
      <button onClick={incrementAsync}>Increment Async</button>
    </>
  );
};
```

## Recipes

### Using spawn function and its context

A `spawn` execute an effect and it keeps the execution context alive, by default, the context will be disposed after effect execution is finished

```js
import { spawn, signal, delay } from "rsignal";

const loginSignal = signal();

const loadDataEffect = async (context, url) => {};

const mainEffect = async (context) => {
  const { call, when, race, all } = context;
  // call another effect
  const result = await call(loadDataEffect, "DATA_URL");
  // wait for signal and return its payload
  const payload = await when(loginSignal);
  // racing effects
  const racingResults = await race({
    loadData: fork(loadDataEffect, "DATA_URL"),
    timeout: delay(3000),
  });
  // loadData wins
  if (racingResults.loadData) {
    // receive loadData result
    console.log(racingResults.loadData.payload());
  }
  // timeout wins
  else if (racingResults.timeout) {
    alert("Timeout");
  }
  // run effects in parallel
  const parallelResults = await all({
    data1: fork(loadData, "DAtA_URL_1"),
    data2: fork(loadData, "DAtA_URL_2"),
  });
  console.log(parallelResults.data1.payload());
  console.log(parallelResults.data2.payload());
};

spawn(mainEffect);
```
