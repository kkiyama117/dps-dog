import {
  ExportDeclaration,
  FunctionDeclaration,
  ModuleItem,
  parse,
} from "./deps.ts";
import {
  isDenopsMainFunc,
  isExportDeclaration,
  isModuleDeclarations,
} from "./jadge.ts";

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
//
export function run(text: string) {
  return getDenopsInstance(text);
}

function getDenopsInstance(code: string) {
  const ast = parse(code, { syntax: "typescript", comments: true });
  // const moduleDeclarations: ModuleDeclaration[] = filterModuleDeclarations(
  //   ast.body,
  // );
  // need it for recognized ModuleItem[] types by compiler
  const body: ModuleItem[] = ast.body;
  const exportDeclarations: ExportDeclaration[] = body
    .filter(isModuleDeclarations)
    .filter(isExportDeclaration);
  // `main` function in main.ts
  const denopsMains: FunctionDeclaration[] = exportDeclarations
    .map((x) => x.declaration)
    .filter(isDenopsMainFunc);
  return denopsMains;
}

import { assert } from "https://deno.land/std/testing/asserts.ts";

Deno.test("getDenopsInstance", async () => {
  const text = await (await fetch("https://raw.githubusercontent.com/vim-denops/denops-helloworld.vim/main/denops/helloworld/main.ts")).text();
  // const text = await Deno.readTextFile("./denops/dps-dog/main.ts");
  console.log(getDenopsInstance(text));
  assert(true);
});
