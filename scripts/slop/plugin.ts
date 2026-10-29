// Oxlint rules for slop that agents wrote in this repo and that no built-in rule reports. Each rule names
// the commit where the slop was fixed and says the fix to make, because an agent reads only the message.

interface Node {
  type: string;
  [key: string]: unknown;
}

interface Context {
  filename: string;
  report(descriptor: { node: Node; message: string }): void;
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const child = (node: Node, key: string): Node | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

const isTestFile = (filename: string): boolean => /\/tests\/|\.test\.ts$/.test(filename);

const hasNumericBound = (node: Node | undefined): boolean => {
  if (node === undefined) return false;
  if (node.type === "BinaryExpression" && /^[<>]=?$/.test(String(node.operator))) return true;
  if (node.type === "LogicalExpression") {
    const left = hasNumericBound(child(node, "left"));
    const right = hasNumericBound(child(node, "right"));
    // `a || i < 20` keeps looping while `a` holds, so only `&&` lets one side bound the loop.
    return node.operator === "&&" ? left || right : left && right;
  }
  return false;
};

// 6247d70 capped five paging loops in tests that ran until the code under test returned null.
const boundedTestLoop = {
  create(context: Context) {
    if (!isTestFile(context.filename)) return {};
    const check = (node: Node): void => {
      if (hasNumericBound(child(node, "test"))) return;
      context.report({
        node,
        message:
          "This loop in a test ends only when the code under test says so; if that code breaks, the test hangs " +
          "until the runner's timeout instead of failing. Add a count to the condition, such as " +
          "`while (offset !== null && pages.length < 20)`, and assert the end after the loop, such as " +
          "`expect(offset).toBeNull()`.",
      });
    };
    return { WhileStatement: check, DoWhileStatement: check, ForStatement: check };
  },
};

const unwrapAssertions = (node: Node | undefined): Node | undefined =>
  node !== undefined && (node.type === "TSAsExpression" || node.type === "TSTypeAssertion")
    ? unwrapAssertions(child(node, "expression"))
    : node;

// PRs 76 and 77 added 30 casts of structuredContent to tests, each copied from the casts next to it.
const noStructuredContentCast = {
  create(context: Context) {
    const check = (node: Node): void => {
      if (child(node, "parent")?.type === "TSAsExpression") return;
      const target = unwrapAssertions(child(node, "expression"));
      const property = target?.type === "MemberExpression" ? child(target, "property") : undefined;
      if (property?.name !== "structuredContent") return;
      context.report({
        node,
        message:
          "A cast of a tool result's structuredContent checks nothing, so the test passes on a result of the " +
          "wrong shape. Parse it: `structured(result, schema)` from tests/structured.ts, with the tool's " +
          "exported output schema or a zod schema of the fields the test reads.",
      });
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};

const isConstAssertion = (node: Node): boolean => {
  const annotation = child(node, "typeAnnotation");
  const name = annotation === undefined ? undefined : child(annotation, "typeName");
  return name?.type === "Identifier" && name.name === "const";
};

// 19ad0dc cast `authInfo.extra.redmine as RequestAuth`; an agent working on issue 92 cast a tool's
// inputSchema to `{ properties?: ... }`. typescript/no-unsafe-type-assertion misses the second, because the
// target type is compatible, and typescript/consistent-type-assertions suggests `satisfies`, which narrows nothing.
const noTypeAssertion = {
  create(context: Context) {
    const check = (node: Node): void => {
      if (node.type === "TSAsExpression" && isConstAssertion(node)) return;
      if (child(node, "parent")?.type === "TSAsExpression") return;
      const property = unwrapAssertions(node);
      const target =
        property?.type === "MemberExpression" ? child(property, "property") : undefined;
      if (target?.name === "structuredContent") return;
      context.report({
        node,
        message:
          "A type assertion makes the compiler trust a shape nobody checked. Narrow instead: RedmineError.is(e, kind) " +
          "for SDK errors, a type guard such as isRecord, a zod parse where data enters, or a type the value already " +
          "has. `satisfies` only checks a literal, and `as unknown as` hides the same lie.",
      });
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};

// The built-in typescript/no-non-null-assertion suggests `?.`, which turns a missing element into a silent
// undefined. 19ad0dc replaced `authInfo!.extra!.redmine` with a union whose variants always carry the field.
const noNonNullAssertion = {
  create(context: Context) {
    return {
      TSNonNullExpression(node: Node) {
        const inner = child(node, "expression");
        const how =
          inner?.type === "MemberExpression" && inner.computed === true
            ? "For `xs[i]!`, iterate with for...of or entries(), or read the element once and throw if it is missing."
            : inner?.type === "CallExpression"
              ? "For `map.get(key)!` or `list.find(...)!`, check the result and throw an error that names what is missing."
              : "If the value can be missing, handle that case; if it cannot, change the type so it is never optional, " +
                "such as a union whose variants always carry the field.";
        context.report({
          node,
          message: `A non-null assertion moves a possible crash out of sight. ${how} Do not swap it for \`?.\` or \`as\`.`,
        });
      },
    };
  },
};

export default {
  meta: { name: "slop" },
  rules: {
    "bounded-test-loop": boundedTestLoop,
    "no-structured-content-cast": noStructuredContentCast,
    "no-non-null-assertion": noNonNullAssertion,
    "no-type-assertion": noTypeAssertion,
  },
};
