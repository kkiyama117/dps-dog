pub mod errors;
mod parser;
mod swc;
mod swc_parser;
mod utils;

#[cfg(feature = "serde")]
use serde::Deserialize;

pub fn generate_parser() {}
#[cfg(test)]
mod tests {
    use crate::parser::DogParser;

    #[test]
    fn it_works() {
        let source = r#"
import { Denops } from "./vendor/https/deno.land/x/denops_std/mod.ts";
import { execute } from "./vendor/https/deno.land/x/denops_std/helper/mod.ts";
import * as vars from "./vendor/https/deno.land/x/denops_std/variable/mod.ts";
import * as autocmd from "./vendor/https/deno.land/x/denops_std/autocmd/mod.ts";
import { ensureString } from "./vendor/https/deno.land/x/unknownutil/mod.ts";

// Export `main` function which is executed from denops.vim
export async function main(denops: Denops) {
  // Register RPC functions by overwriting `dispatcher` like:
  denops.dispatcher = {
    // Developers can define multiple endpoints which take arbitrary number of arguments
    // and return arbitrary value as a Promise.
    // This function can be called by denops#request() or denops#notify() functions.
    async say(where: unknown): Promise<void> {
      // Ensure that `where` is `string` here
      ensureString(where);
      // Use `call` to call Vim's function
      const name = await denops.call("input", "Your name: ");
      // Use `eval` to evaluate Vim's expression
      const progname = await denops.eval("v:progname");
      // Construct messages
      const messages = [
        `Hello ${where}`,
        `Your name is ${name}`,
        `This is ${progname}`,
      ];
      // Use `cmd` to execute Vim's command
      await denops.cmd(`redraw | echomsg message`, {
        message: messages.join(". "),
      });
    },

    async get_variables(): Promise<void> {
      // Access global variable
      console.log(
        "g:denops_helloworld",
        await vars.g.get(denops, "denops_helloworld"),
      );
      // Access buffer-local variable
      console.log(
        "b:denops_helloworld",
        await vars.b.get(denops, "denops_helloworld"),
      );
      // Access window-local variable
      console.log(
        "w:denops_helloworld",
        await vars.w.get(denops, "denops_helloworld"),
      );
      // Access tabpage-local variable
      console.log(
        "t:denops_helloworld",
        await vars.t.get(denops, "denops_helloworld"),
      );
      // Access Vim's variable
      console.log("v:errmsg", await vars.v.get(denops, "errmsg"));
    },

    async set_variables(): Promise<void> {
      // Replace global variable
      await vars.g.set(denops, "denops_helloworld", "Global HOGEHOGE");
      // Replace buffer-local variable
      await vars.b.set(denops, "denops_helloworld", "Buffer HOGEHOGE");
      // Replace window-local variable
      await vars.w.set(denops, "denops_helloworld", "Window HOGEHOGE");
      // Replace tabpage-local variable
      await vars.t.set(denops, "denops_helloworld", "Tabpage HOGEHOGE");
      // Replace Vim's variable
      await vars.v.set(denops, "errmsg", "Vim HOGEHOGE");
    },

    async remove_variables(): Promise<void> {
      // Remove global variable
      await vars.g.remove(denops, "denops_helloworld");
      // Remove buffer-local variable
      await vars.b.remove(denops, "denops_helloworld");
      // Remove window-local variable
      await vars.w.remove(denops, "denops_helloworld");
      // Remove tabpage-local variable
      await vars.t.remove(denops, "denops_helloworld");
    },

    async register_autocmd(): Promise<void> {
      await denops.cmd("new");
      // Register autocmd
      await autocmd.group(denops, "denops_helloworld", (helper) => {
        // Use 'helper.remove()' to remove autocmd
        helper.remove("*", "<buffer>");
        // Use 'helper.define()' to define autocmd
        helper.define(
          "CursorHold",
          "<buffer>",
          "echomsg 'Hello Denops CursorHold'",
        );
        helper.define(
          ["BufEnter", "BufLeave"],
          "<buffer>",
          "echomsg 'Hello Denops BufEnter/BufLeave'",
        );
      });
    },
  };

  // Use 'execute()' to execute multiline Vim script
  await execute(
    denops,
    `
    command! HelloWorld call denops#notify("${denops.name}", "say", ["World"])
    command! HelloDenops call denops#notify("${denops.name}", "say", ["Denops"])
    `,
  );
}
    "#;
        DogParser::initialize("denops-helloworld", source)
            .unwrap()
            .try_parse();
    }
}
#[cfg(feature = "serde")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Options {
    // #[serde(default)]
    // pub import_map: ImportHashMap,
    #[serde(default)]
    pub swc_options: SWCOptions,
}

#[cfg(feature = "serde")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SWCOptions {}

#[cfg(feature = "serde")]
impl Default for SWCOptions {
    fn default() -> Self {
        SWCOptions {}
    }
}
