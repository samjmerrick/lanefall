# Screenshots

Screenshots of every screen (menus, browsing, run nodes, match, overlays, corrupt-save and iOS tip) at the three supported phone viewports (360×740, 390×844 and 430×932), named `<screen>-<width>x<height>.png`. They are produced by `tests/e2e/screens.spec.ts`, which also fails if any screen scrolls sideways. Regenerate them with `pnpm screens` after any UI change and commit the result; a plain `pnpm e2e` writes its copies to `test-results/screens/committed` and leaves this folder alone.
