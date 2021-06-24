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
///
/// Allows to build more complicated parser by providing a callback
/// to `parse_module`.
#[derive(Clone)]
pub struct SWC {
    /// specifier identifies file.
    pub specifier: Specifier,
    pub module: Module,
    /// Source map contains data of file.
    pub source_map: Rc<SourceMap>,
    /// Comments are collected.
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
// Import 'start' function from denops_std
import { ensureString, main } from "https://deno.land/x/denops_std/mod.ts";
import {
  AutocmdHelper,
} from "https://deno.land/x/denops_std@v0.14.1/vim/mod.ts";

// Call 'main' with async callback. The callback get RunnerContext.
main(async ({ vim }) => {
  // Register RPC functions with 'vim.register' like:
  vim.register({
    /**
         * Developers can define multiple endpoints which take arbitrary number of arguments
         * and return arbitrary value as a Promise.
         * This function can be called by denops#request() or denops#notify() functions.
         *
         * @param where
         */
    async say(where: unknown): Promise<void> {
      // Ensure that `prefix` is 'string' here
      ensureString(where, "where");
      // Use `call` to call Vim's function
      const name = await vim.call("input", "Your name: ");
      // Use `eval` to evaluate Vim's expression
      const progname = await vim.eval("v:progname");
      // Construct messages
      const messages = [
        `Hello ${where}`,
        `Your name is ${name}`,
        `This is ${progname}`,
      ];
      // Use `cmd` to execute Vim's command
      await vim.cmd(`redraw | echomsg message`, {
        message: messages.join(". "),
      });
    },

    async get_variables(): Promise<void> {
      // Use 'vim.g.get' to access global variable
      console.log("g:denops_helloworld", await vim.g.get("denops_helloworld"));
      // Use 'vim.b.get' to access buffer-local variable
      console.log("b:denops_helloworld", await vim.b.get("denops_helloworld"));
      // Use 'vim.w.get' to access window-local variable
      console.log("w:denops_helloworld", await vim.w.get("denops_helloworld"));
      // Use 'vim.t.get' to access tabpage-local variable
      console.log("t:denops_helloworld", await vim.t.get("denops_helloworld"));
      // Use 'vim.v.get' to access Vim's variable
      console.log("v:errmsg", await vim.v.get("errmsg"));
    },

    async set_variables(): Promise<void> {
      // Use 'vim.g.set' to replace global variable
      await vim.g.set("denops_helloworld", "Global HOGEHOGE");
      // Use 'vim.b.set' to replace buffer-local variable
      await vim.b.set("denops_helloworld", "Buffer HOGEHOGE");
      // Use 'vim.w.set' to replace window-local variable
      await vim.w.set("denops_helloworld", "Window HOGEHOGE");
      // Use 'vim.t.set' to replace tabpage-local variable
      await vim.t.set("denops_helloworld", "Tabpage HOGEHOGE");
      // Use 'vim.v.set' to replace Vim's variable
      await vim.v.set("errmsg", "Vim HOGEHOGE");
    },

    async remove_variables(): Promise<void> {
      // Use 'vim.g.remove' to remove global variable
      await vim.g.remove("denops_helloworld");
      // Use 'vim.b.remove' to remove buffer-local variable
      await vim.b.remove("denops_helloworld");
      // Use 'vim.w.remove' to remove window-local variable
      await vim.w.remove("denops_helloworld");
      // Use 'vim.t.remove' to remove tabpage-local variable
      await vim.t.remove("denops_helloworld");
      // Use 'vim.v.remove' to remove Vim variable
      await vim.v.remove("errmsg");
    },

    async register_autocmd(): Promise<void> {
      await vim.cmd("new");
      // Use 'vim.autocmd' to register autocmd
      await vim.autocmd("denops_helloworld", (helper: AutocmdHelper) => {
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
  });

  // Use 'vim.execute()' to execute Vim script
  /// [Denops]
  /// Adds x and y.
  ///  @param {number} x
  ///  @param {number} y
  ///  @returns {number} x と y の加算
  await vim.execute(`
    command! HelloWorld call denops#notify("${vim.name}", "say", ["World"])
    command! HelloDenops call denops#notify("${vim.name}", "say", ["Denops"])
  `);

  console.log("denops-helloworld.vim (std) has loaded");
});
    "#;
        // let (code, _) = st("https://deno.land/x/mod.ts", source, false);
        // assert!(code.contains("var D;\n(function(D) {\n"));
        // assert!(code.contains("_applyDecoratedDescriptor("));
        assert_eq!(1 + 1, 2);
        let tester = SWC::parse("foo/bar.ts", source).unwrap();
        for i in tester.module.body {
            println!("{:?}", serde_json::to_string(&i));
        }
        let (a, b) = &tester.comments.take_all();
        println!("{:?}", a);
        println!("{:?}", b);
        // for a2 in a.borrow().iter() {
        //     println!("{:?}", a2);
        // }
    }
}
