import { isObject } from "./deps.ts";
import {
  Declaration,
  ExportDeclaration,
  FunctionDeclaration,
  ModuleDeclaration,
  ModuleItem,
} from "./deps.ts";

export function isModuleDeclarations(
  arg: ModuleItem,
): arg is ModuleDeclaration {
  return isObject(arg) && typeof arg.type === "string" &&
    !arg.type.includes("Statement");
}

export function isExportDeclaration(
  declaration: ModuleDeclaration,
): declaration is ExportDeclaration {
  return isObject(declaration) && declaration.type === "ExportDeclaration";
}

export function isDenopsMainFunc(
  declaration: Declaration,
): declaration is FunctionDeclaration {
  return declaration.type === "FunctionDeclaration" &&
    (declaration as FunctionDeclaration).identifier.value === "main";
}
