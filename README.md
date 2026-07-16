# lint-katex-ipynb

`lint-katex-ipynb` checks Markdown cells in Jupyter notebooks for KaTeX parse
errors. It uses markdownlint's native micromark math tokens, so it intentionally
checks only `$...$` and `$$...$$` math and ignores LaTeX `\(...\)` and `\[...\]`
delimiters.

```sh
lint-katex-ipynb notebook.ipynb "notes/**/*.ipynb"
```

Diagnostics are printed as:

```text
notebook.ipynb:cell:<index>:<line>:<column>: <message>
```
