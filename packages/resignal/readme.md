- [`[Re]act [Signal]`](#react-signal)
  - [Installation](#installation)
  - [Motivation](#motivation)

# `[Re]act [Signal]`

A React lib for controlling app flow

## Installation

**with NPM**

```bash
npm i resignal --save
```

**with YARN**

```bash
yarn add resignal
```

## Motivation

This library is inspired by Redux Saga. Resignal does not require any state management. You can manage the state of application manually. A heart of Resignal is `signal`.

Creating a signal is very simple

```js
import { signal } from "resignal";

// no arg needed
const incrementSignal = signal();
const decrementSignal = signal();
```

The `signal` itself is a function so when you call it it means you are emitting that signal

```js
// emit without payload
incrementSignal();

// emit with payload
incrementSignal(1);

// emit with effect
incrementSignal(() => {
  // update something
  // the INCREMENT signal will be emitted after the effect is finished
});

// even emit with async effect
incrementSignal(async () => {
  // update something
  // the INCREMENT signal will be emitted after the async effect is finished
});
```

Let's create a counter signal

`counter.js`

```js
import { signal } from "resignal";

let count = 0;

// define signals
const incrementSignal = signal();
const decrementSignal = signal();
const onCountChange = [incrementSignal, decrementSignal];

// define methods and accessors
const getCount = () => count;
const increment = () => incrementSignal(() => count++);
const decrement = () => decrementSignal(() => count--);

export { onCountChange, getCount, increment, decrement };
```

You can consume signal by using useSignal hook

```js
import { getCount, onCountChange, increment, decrement } from "./counter.js";

const Counter = () => {
  // the host component will be re-rendered whenever onCountChange (incrementSignal, decrementSignal) emitted
  useSignal(onCountChange);

  return (
    <>
      <h1>{getCount()}</h1>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </>
  );
};
```

As you see the signal is not state management, you must store your app state in local variable or other state management. Actually you can use signal payload instead of state management, but it is very basic, not powerful.

Let's refactor counter.js and see what we can play with signal payload

```js
import { signal } from "resignal";

// define count signal and use payload to store initial value of count
const countSignal = signal({ payload: 0 });
// onCountChange is count signal
const onCountChange = countSignal;

// define methods and accessors
const getCount = () => countSignal.payload();
const increment = () => countSignal(countSignal.payload() + 1);
const decrement = () => countSignal(countSignal.payload() - 1);

export { onCountChange, getCount, increment, decrement };
```

You might create a shorter version of counter app

```js
import { signal } from "resignal";

const count = signal({ payload: 0 });

const Counter = () => {
  useSignal(count);

  return (
    <>
      <h1>{count.payload()}</h1>
      <button onClick={() => count(count.payload() + 1)}>Increment</button>
      <button onClick={() => count(count.payload() - 1)}>Decrement</button>
    </>
  );
};
```

The `signal` is very flexible, it depends on the way you use it
