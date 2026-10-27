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

Supabase browser bundles are served from `assets/vendor`: version 2.118.0 matches
the former `@2` CDN response, and Taught Formula Practice retains 2.49.8. Nunito
WOFF2 files and their original Unicode coverage are in `assets/fonts`; the normal
stylesheet preserves weights 400/600/700/800, and the `-900` stylesheet also
includes 900 where it was previously requested. Keep the bundled licenses.
`assets/local-resources.json` records source URLs and SHA-256 checksums.

The browser suites also test the actual local SDKs against a synthetic API: login,
saved sessions, authenticated requests, batch practice levels, and font loading.
No browser test sends requests to the production database.
