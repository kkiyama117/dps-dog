use crate::errors::{SWCDiagnosticBuffer, SWCErrorBuffer};
use crate::utils::Specifier;
// use std::{path::Path, rc::Rc};
use std::rc::Rc;
use swc_common::{
    comments::SingleThreadedComments,
    errors::{Handler, HandlerFlags},
    FileName, SourceMap,
};
use swc_ecmascript::{
    ast::Module,
    parser::{lexer::Lexer, JscTarget, Parser, StringInput, Syntax, TsConfig},
};

#[derive(Clone, Debug)]
pub struct ParseResult {
    specifier: Specifier,
    pub module: Module,
    /// Comments are collected.
    pub comments: SingleThreadedComments,
}

/// Low-level utility structure with common AST parsing functions.
#[derive(Clone)]
pub struct SWC {
    /// specifier identifies file.
    pub specifier: Specifier,
    pub module: Module,
    /// Source map contains data of file.
    pub source_map: Rc<SourceMap>,
    /// Collected comments.
    pub comments: SingleThreadedComments,
    // pub buffered_error: SwcErrorBuffer,
    // pub handler: Handler,
}

impl SWC {
    /// - `specifier` - The module specifier for the module.
    /// - `source` - The source code for the module.
    pub fn parse(specifier: &str, source: &str) -> Result<Self, SWCDiagnosticBuffer> {
        // generate source map
        let source_map = SourceMap::default();
        let sm = Rc::new(source_map);
        let source_file = sm.new_source_file(
            // FileName::Real(Path::new(specifier).to_path_buf()),
            FileName::Custom(specifier.into()),
            source.into(),
        );

        // generate parse config
        let syntax = get_default_ts_syntax();
        let input = StringInput::from(&*source_file);
        let comments = SingleThreadedComments::default();
        let lexer = Lexer::new(syntax, JscTarget::Es2020, input, Some(&comments));

        let mut parser = Parser::new_from(lexer);

        let buffered_error = SWCErrorBuffer::new(specifier.into());
        let handler = Handler::with_emitter_and_flags(
            Box::new(buffered_error.clone()),
            HandlerFlags {
                can_emit_warnings: true,
                dont_buffer_diagnostics: true,
                ..Default::default()
            },
        );
        let source_map = sm.clone();
        let module = parser.parse_module().map_err(move |err| {
            let mut diagnostic = err.into_diagnostic(&handler);
            diagnostic.emit();
            SWCDiagnosticBuffer::from_error_buffer(buffered_error, |span| {
                (&source_map).lookup_char_pos(span.lo)
            })
        })?;

        // let globals = Globals::new();
        // let top_level_mark = GLOBALS.set(&globals, || Mark::fresh(Mark::root()));

        Ok(Self {
            specifier: specifier.into(),
            module,
            source_map: sm,
            comments, // globals: Globals::new(),
        })
    }
}

pub fn get_default_ts_syntax() -> Syntax {
    let ts_config = TsConfig {
        decorators: true,
        dynamic_import: true,
        ..Default::default()
    };
    Syntax::Typescript(ts_config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn ts() {
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
        // let (code, _) = st("https://deno.land/x/mod.ts", source, false);
        // assert!(code.contains("var D;\n(function(D) {\n"));
        // assert!(code.contains("_applyDecoratedDescriptor("));
        assert_eq!(1 + 1, 2);
        // let tester = SWC::parse("foo/bar.ts", source).unwrap();
        // for i in tester.module.body {
        //     println!("{:?}\n", serde_json::to_string(&i));
        // }
        // let (a, b) = &tester.comments.take_all();
        // println!("{:?}", a);
        // println!("{:?}", b);
        // for a2 in a.borrow().iter() {
        //     println!("{:?}", a2);
        // }
    }
}
