# lilchampsabacus.co.in

Student practice entry pages are complete HTML documents so opening a page does
not require downloading another HTML template first. Edit the matching
`*-base.html` template, then run:

```sh
npm ci --ignore-scripts
npm run build
npm test
```

Commit the generated HTML along with the template. CI checks that they match.
The generated pages retain the server-verified level checks and mobile layout.

Tailwind 3.4.17 generates `assets/practice.css` from the HTML and JavaScript.
The custom Mistake Tracker theme and runtime progress colours are preserved in
`tailwind.config.cjs`. Rebuild after adding utility classes and bump the CSS link
version when publishing a changed stylesheet.

`optional-features.js` loads the report-image library on the first download and
confetti on the first celebration. Failed downloads can be retried.
