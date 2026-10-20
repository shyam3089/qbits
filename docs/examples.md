<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Compilable examples

Save as src/Counter.qb. Add Counter.css using ordinary CSS.

```qubits
import "./Counter.css"

component Counter(label = "Count: "):
    count = 0
    div class="counter":
        button class="counter-button" text=label + str(count):
            on click:
                count = count + 1
```

Save as src/Greeting.qb:

```qubits
component Greeting:
    name = ""

    input:
        value=name
        on input:
            name = event.value

    p text="Hello, " + name
```

Save as src/App.qb:

```qubits
import Counter from "./Counter.qb"
import Greeting from "./Greeting.qb"

component App:
    main class="page":
        h1 text="Two independent counters"
        Counter label="First: " class="compact"
        Counter label="Second: "
        Greeting
```

Mount App from main.ts with the browser runtime. The starter includes Counter.css:

```css
.counter { padding: 16px; }
.counter-button { color: rgb(20, 80, 160); }
.counter.compact { padding: 4px; }
```
