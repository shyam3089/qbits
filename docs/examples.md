<!-- Generated for Qbits 0.1.0-beta.2 by npm run sync. -->
# Compilable examples

Save as src/Counter.qb. Add Counter.css using ordinary CSS.

```qbits
import "./Counter.css"

component Counter(label = "Count: "):
    count = 0
    div class="counter":
        button class="counter-button" text=label + str(count):
            on click:
                count = count + 1
```

Save as src/Greeting.qb:

```qbits
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

```qbits
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

Save as src/Catalog.qb:

```qbits
class Product:
    id = 0
    name = ""
    quantity = 0
    computed label = name + " x " + str(quantity)
    action increment:
        quantity = quantity + 1

component Catalog:
    initialized = false
    products = [Product(1, "Tea", 1), Product(2, "Coffee", 1)]
    computed productCount = len(products)
    on init:
        initialized = true
    on cleanup:
        initialized = false

    section class="catalog":
        h2 text="Products: " + str(productCount)
        ul:
            for product in products key=product.id:
                li class="product":
                    input:
                        value=product.name
                        on input:
                            product.name = event.value
                    span text=product.label
                    button text="Increase":
                        on click:
                            product.increment()
                    button text="Move first":
                        on click:
                            products.move(product, 0)
                    button text="Remove":
                        on click:
                            products.remove(product)
        button text="Add Cocoa":
            on click:
                products.append(Product(3, "Cocoa", 1))
```

Save as src/App.qb:

```qbits
import Counter from "./Counter.qb"
import Greeting from "./Greeting.qb"
import NotificationSetting from "./NotificationSetting.qb"
import Catalog from "./Catalog.qb"

component App:
    main class="page":
        h1 text="Two independent counters"
        Counter label="First: " class="compact"
        Counter label="Second: "
        Greeting
        NotificationSetting
        Catalog
```

Mount App from main.ts with the browser runtime. The starter includes Counter.css:

```css
.counter { padding: 16px; }
.counter-button { color: rgb(20, 80, 160); }
.counter.compact { padding: 4px; }
```
