import { builtinRules } from "eslint/use-at-your-own-risk";
import { relative } from "node:path";

export const NEW_FUNCTION_LIMIT = 10;
const coreRule = builtinRules.get("complexity");

function calleeName(node, sourceCode) {
  if (node.type === "CallExpression") return `${calleeName(node.callee, sourceCode)}()`;
  if (node.type === "MemberExpression") return `${calleeName(node.object, sourceCode)}.${sourceCode.getText(node.property)}`;
  return node.name ?? node.type;
}

function label(node, sourceCode) {
  if (node.id?.name) return node.id.name;
  const parent = node.parent;
  if (parent?.type === "VariableDeclarator") return sourceCode.getText(parent.id);
  if (parent?.key) {
    const owner = parent.parent?.parent?.id?.name;
    return [owner, sourceCode.getText(parent.key)].filter(Boolean).join(".");
  }
  if (parent?.type === "CallExpression") {
    return `${calleeName(parent.callee, sourceCode)}:argument${parent.arguments.indexOf(node)}`;
  }
  if (parent?.type === "JSXExpressionContainer" && parent.parent.type === "JSXAttribute") {
    return `jsx:${sourceCode.getText(parent.parent.name)}`;
  }
  return node.type;
}

// Reuse ESLint's code-path accounting, including optional chaining, default
// parameters, logical assignments, and isolated class initializers.
export function createComplexityRule({ root, baseline = {}, onMeasure } = {}) {
  return {
    meta: {
      type: "suggestion",
      schema: [],
      messages: {
        regression: "{{key}} has complexity {{actual}}; allowed {{allowed}}. Refactor the function rather than raising its baseline.",
      },
    },
    create(context) {
      const scopes = [{ key: "", counts: new Map() }];
      const identities = new WeakMap();
      const file = relative(root ?? context.cwd, context.filename).replaceAll("\\", "/");
      const report = ({ node, data }) => {
        const key = `${file}::${identities.get(node)}`;
        const actual = Number(data.complexity);
        const allowed = baseline[key] ?? NEW_FUNCTION_LIMIT;
        onMeasure?.({ key, complexity: actual, allowed, line: node.loc.start.line });
        if (actual > allowed) {
          context.report({ node, messageId: "regression", data: { key, actual, allowed } });
        }
      };
      const proxy = Object.create(context, {
        options: { value: [0] },
        report: { value: report },
      });
      const listeners = coreRule.create(proxy);
      return {
        ...listeners,
        onCodePathStart(codePath, node) {
          listeners.onCodePathStart(codePath, node);
          const parent = scopes.at(-1);
          const name = label(node, context.sourceCode);
          const count = (parent.counts.get(name) ?? 0) + 1;
          parent.counts.set(name, count);
          const suffix = count > 1 ? `#${count}` : "";
          const key = [parent.key, `${name}${suffix}`].filter(Boolean).join("/");
          identities.set(node, key);
          scopes.push({ key: codePath.origin === "program" ? "" : key, counts: new Map() });
        },
        onCodePathEnd(codePath, node) {
          listeners.onCodePathEnd(codePath, node);
          scopes.pop();
        },
      };
    },
  };
}
