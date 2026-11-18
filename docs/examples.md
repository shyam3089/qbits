<!-- Generated for Qbits 1.1.0 by npm run sync. -->
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

Save as src/HtmlForm.qb for native form bindings:

```qbits
component HtmlForm:
    name = ""
    city = "Bengaluru"

    form class="native-form" aria-label="Profile form":
        label for="profile-name" text="Name"
        input id="profile-name" name="name" autocomplete="name" placeholder="Ada Lovelace":
            value=name
            on input:
                name = event.value
        label for="profile-city" text="City"
        select id="profile-city" name="city":
            value=city
            on change:
                city = event.value
            option value="Bengaluru" text="Bengaluru"
            option value="Mysuru" text="Mysuru"
        output for="profile-name profile-city" text=name + " — " + city
        qbits-status data-stage="7A" aria-live="polite" text="Native form bindings active"
```

Save as src/SvgChart.qb for reactive inline SVG:

```qbits
component SvgChart:
    radius = 24

    figure class="svg-example":
        svg viewBox="0 0 240 140" width=240 height=140 role="img" aria-label="Interactive SVG radius chart":
            defs:
                linearGradient id="chart-gradient" x1="0%" x2="100%":
                    stop offset="0%" stop-color="#4f46e5"
                    stop offset="100%" stop-color="#06b6d4"
            g transform="translate(120 70)":
                circle r=radius fill="url(#chart-gradient)" stroke="currentColor" stroke-width=2:
                    on click:
                        radius = radius + 4
                path d="M -70 50 H 70" fill="none" stroke="currentColor"
            foreignObject x=8 y=8 width=100 height=28:
                div class="svg-label" text="Radius: " + str(radius)
        figcaption text="Select the circle to grow it."
```

Save as src/App.qb:

```qbits
import Counter from "./Counter.qb"
import Greeting from "./Greeting.qb"
import NotificationSetting from "./NotificationSetting.qb"
import Catalog from "./Catalog.qb"
import HtmlForm from "./HtmlForm.qb"
import SvgChart from "./SvgChart.qb"

component App:
    main class="page":
        h1 text="Two independent counters"
        Counter label="First: " class="compact"
        Counter label="Second: "
        Greeting
        NotificationSetting
        Catalog
        HtmlForm
        SvgChart
```

Mount App from main.ts with the browser runtime. The starter includes Counter.css:

```css
.counter { padding: 16px; }
.counter-button { color: rgb(20, 80, 160); }
.counter.compact { padding: 4px; }
```

## HTTP tutorials

Start with [reactive product search](../examples/http-basics/ProductSearch.qb), then use the [complete e-commerce storefront](../examples/http-commerce/Storefront.qb) with its [shared commerce service](../examples/http-commerce/Commerce.qb). The [HTTP guide](http-stage4e.md) explains every declaration, state, lifecycle rule, security boundary and limitation used by these files. All three example files are checked as one module graph.

## External HTML template example

The [external-template app](../examples/html-template/App.qb) combines imported Qbits
components with separate standards-based HTML files. Its registration component shows
native `qb-model` and submit handling. Its product component shows keyed `qb-for`,
reactive text, and an inline SVG gradient with a reactive SVG attribute. These are
Stage 7B.0 native bindings; they intentionally do not claim the reserved Stage 7B.1
form registration or validation API.
