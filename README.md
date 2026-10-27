# lilchampsabacus.co.in

Student practice entry pages are complete HTML documents so opening a page does
not require downloading another HTML template first. Edit the matching
`*-base.html` template, then run:

```sh
node scripts/build-practice-pages.cjs
node tests/student-startup-smoke.cjs
node tests/practice-loading.cjs
```

Commit the generated HTML along with the template. CI checks that they match.
The generated pages retain the server-verified level checks and mobile layout.
