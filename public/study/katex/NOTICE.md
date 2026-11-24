# KaTeX

The browser uses KaTeX 0.19.1, its mhchem extension and its original WOFF2 fonts. They are served from this directory. No CDN or model request is made when a learner opens a formula. [Release](https://github.com/KaTeX/KaTeX/releases/tag/v0.19.1)

The npm archive `katex-0.19.1.tgz` has SHA-256 `24da5a599eb2fcede2e270b99a6ff48bca816beecc95feeb84e8cccbd1bb34fd`. The module bundles the published `dist/katex.mjs` and `dist/contrib/mhchem.mjs` with esbuild 0.25.12, minified in ES module format. The stylesheet uses the published `dist/katex.min.css` with the legacy WOFF and TTF URL fallbacks removed. The bundled WOFF2 files are unmodified.

KaTeX is copyright Khan Academy and other contributors. See [MIT license](LICENSE). The bundled chemistry parser incorporates modifications of MathJax mhchem, copyright 2011–2015 The MathJax Consortium and 2015–2018 Martin Hensel. See [Apache 2.0 license](LICENSE-mhchem).

The fonts are copyright Design Science, Inc. and Khan Academy. See the [notices and reserved font names](LICENSE-fonts) and the [SIL Open Font License](OFL-1.1).
