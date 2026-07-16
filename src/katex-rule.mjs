import katex from "katex";

/** `katexRuleName` is the primary markdownlint identifier for KaTeX parse diagnostics. */
export const katexRuleName = "KTX001";

/** `katexRule` validates markdownlint-native dollar math with KaTeX. */
export const katexRule = {
  names: [katexRuleName, "katex-parse"],
  description: "KaTeX parse error in markdown math",
  tags: ["math"],
  parser: "micromark",
  function: validateKatexMath,
};

/** `validateKatexMath` reports KaTeX failures for micromark math token content. */
function validateKatexMath(params, onError) {
  for (const token of findMathTokens(params.parsers.micromark.tokens)) {
    if (token.type === "mathText") {
      validateMathText(token, params, onError);
    } else {
      validateMathFlow(token, params, onError);
    }
  }
}

/** `findMathTokens` returns all mathText and mathFlow tokens below `tokens`. */
function findMathTokens(tokens) {
  const mathTokens = [];
  const queue = [...tokens];

  while (queue.length > 0) {
    const token = queue.shift();

    if (token.type === "mathText" || token.type === "mathFlow") {
      mathTokens.push(token);
    }

    queue.unshift(...token.children);
  }

  return mathTokens;
}

/** `validateMathText` validates inline mathTextData children as inline KaTeX. */
function validateMathText(token, params, onError) {
  const dataTokens = collectChildrenByType(token, "mathTextData");
  const expression = dataTokens.map((dataToken) => dataToken.text).join("");

  renderExpression(expression, false, (error) => {
    reportKatexError(error, params, onError, locationForInline(dataTokens, error.position));
  });
}

/** `validateMathFlow` validates mathFlowValue children together as display KaTeX. */
function validateMathFlow(token, params, onError) {
  const valueTokens = collectChildrenByType(token, "mathFlowValue");
  const expression = valueTokens.map((valueToken) => valueToken.text).join("\n");

  renderExpression(expression, true, (error) => {
    reportKatexError(error, params, onError, locationForFlow(valueTokens, error.position));
  });
}

/** `collectChildrenByType` returns descendants of `token` whose type matches `type`. */
function collectChildrenByType(token, type) {
  const matches = [];
  const queue = [...token.children];

  while (queue.length > 0) {
    const child = queue.shift();

    if (child.type === type) {
      matches.push(child);
    }

    queue.unshift(...child.children);
  }

  return matches;
}

/** `renderExpression` passes `expression` to KaTeX using notebook-compatible options. */
function renderExpression(expression, displayMode, onError) {
  try {
    katex.renderToString(expression, {
      throwOnError: true,
      strict: false,
      displayMode,
    });
  } catch (error) {
    onError(error);
  }
}

/** `reportKatexError` converts a KaTeX exception and location into a markdownlint error. */
function reportKatexError(error, params, onError, location) {
  const line = params.lines[location.lineNumber - 1] ?? "";
  const range = rangeForLine(line, location.column);

  onError({
    lineNumber: location.lineNumber,
    detail: messageForKatexError(error),
    range,
  });
}

/** `messageForKatexError` preserves KaTeX's parse message when one is available. */
function messageForKatexError(error) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

/** `rangeForLine` returns a one-character markdownlint range when the line has content. */
function rangeForLine(line, column) {
  if (line.length === 0) {
    return undefined;
  }

  return [Math.min(Math.max(column, 1), line.length), 1];
}

/** `locationForInline` maps a KaTeX offset in inline TeX to source line and column. */
function locationForInline(dataTokens, position) {
  return locationForTokenParts(dataTokens, "", position);
}

/** `locationForFlow` maps a KaTeX offset in display TeX to source line and column. */
function locationForFlow(valueTokens, position) {
  return locationForTokenParts(valueTokens, "\n", position);
}

/** `locationForTokenParts` maps joined token text offsets back to micromark coordinates. */
function locationForTokenParts(parts, separator, position) {
  if (parts.length === 0) {
    return { lineNumber: 1, column: 1 };
  }

  const target = numericPosition(position);
  let offset = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const startOffset = offset;
    const endOffset = startOffset + part.text.length;

    if (target >= startOffset && target < endOffset) {
      return {
        lineNumber: part.startLine,
        column: part.startColumn + target - startOffset,
      };
    }

    if (target === endOffset && part.text.length > 0) {
      return {
        lineNumber: part.startLine,
        column: part.startColumn + part.text.length - 1,
      };
    }

    offset = endOffset;

    if (index < parts.length - 1) {
      if (target >= offset && target < offset + separator.length) {
        const nextPart = parts[index + 1];

        return {
          lineNumber: nextPart.startLine,
          column: nextPart.startColumn,
        };
      }

      offset += separator.length;
    }
  }

  return endLocationForPart(parts[parts.length - 1]);
}

/** `numericPosition` normalizes KaTeX positions that may be absent on non-parse errors. */
function numericPosition(position) {
  return Number.isInteger(position) && position >= 0 ? position : 0;
}

/** `endLocationForPart` points at the final character of `part`, or its start if empty. */
function endLocationForPart(part) {
  return {
    lineNumber: part.startLine,
    column: part.text.length > 0 ? part.startColumn + part.text.length - 1 : part.startColumn,
  };
}
