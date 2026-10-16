# Screen check

Renders every VilleDash screen (customer, rider, merchant, admin, landing pages)
with sample data and no Firebase connection, then screenshots each at phone
width and reports crashes, console errors and sideways overflow.

```
cd tools/screen-check
npm i --no-save esbuild@0.24 playwright@1   # once
npx playwright install chromium             # once
node build.js && (node serve.js &) && node shots.js
```

Screenshots land in `shots/`. Sample data is in `main.jsx`; Firebase is replaced
by the in-memory stand-ins in `mocks/`. Not part of the app build.
