import {parse, print} from "https://x.nest.land/swc@0.0.6/mod.ts";

const inner = (await Deno.readTextFile("./examples/app.ts"));
const ast = parse(inner, {
    syntax: "typescript",
    comments: true
});

// {
//   type: "Module",
//   span: { start: 0, end: 36, ctxt: 0 },
//   body: [
//     {
//       type: "VariableDeclaration",
//       span: [Object],
//       kind: "const",
//       declare: false,
//       declarations: [Array]
//     }
//   ],
//   interpreter: null
// }

let code = print(ast, {
    module: {
        type: "umd"
    }
});

console.log(ast.type);
console.log(ast.span);
// const x: string = "Hello, Deno SWC!";