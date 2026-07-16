# lint-katex-ipynb

`lint-katex-ipynb` checks Markdown cells in Jupyter notebooks for KaTeX parse
errors. It uses markdownlint's native micromark math tokens, so it intentionally
checks only `$...$` and `$$...$$` math and ignores LaTeX `\(...\)` and `\[...\]`
delimiters.

## Installation

Add the versioned GitHub release as a development dependency:

```sh
npm install --save-dev https://github.com/asmichel/lint-katex-ipynb/releases/download/v1.0.0/lint-katex-ipynb-1.0.0.tgz
```

The installed `lint-katex-ipynb` executable is available to package scripts or
through `npx`.

## Usage

```sh
npx lint-katex-ipynb notebook.ipynb "notes/**/*.ipynb"
```

Diagnostics are printed as:

```text
notebook.ipynb:cell:<index>:<line>:<column>: <message>
```
