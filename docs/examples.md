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
    enabled = true

    input:
        value=name
        on input:
            name = event.value

    if name == "":
        p text="Enter your name"
    else:
        p text="Hello, " + name

    if enabled and name != "":
        button text="Continue"

    if not enabled:
        p text="Unavailable"

    button text="Disable greeting":
        on click:
            enabled = false
```

Save as src/NotificationSetting.qb:

```qubits
component NotificationSetting:
    enabled = false

    button text="Disable notifications":
        on click:
            enabled = false

    input:
        type="checkbox"
        checked=enabled
        on change:
            enabled = event.checked

    if enabled:
        p text="Notifications enabled"
    else:
        p text="Notifications disabled"
```

Save as src/App.qb:

```qubits
import Counter from "./Counter.qb"
import Greeting from "./Greeting.qb"
import NotificationSetting from "./NotificationSetting.qb"

component App:
    main class="page":
        h1 text="Two independent counters"
        Counter label="First: " class="compact"
        Counter label="Second: "
        Greeting
        NotificationSetting
```

Mount App from main.ts with the browser runtime. The starter includes Counter.css:

```css
.counter { padding: 16px; }
.counter-button { color: rgb(20, 80, 160); }
.counter.compact { padding: 4px; }
```
