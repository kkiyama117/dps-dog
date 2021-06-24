// use std::path::Path;
// use swc_common::comments::{CommentKind, Comments, SingleThreadedComments};
// use swc_common::{
//     self,
//     errors::{ColorConfig, Handler},
//     sync::Lrc,
//     BytePos, SourceMap, Span, SyntaxContext,
// };
// use swc_ecmascript::parser::{lexer::Lexer, Capturing, Parser, StringInput, Syntax};
//
// fn main() {
//     let cm: Lrc<SourceMap> = Default::default();
//     let handler = Handler::with_tty_emitter(ColorConfig::Always, true, false, Some(cm.clone()));
//
//     // Real usage
//     let fm = cm
//         .load_file(Path::new("examples/app.ts"))
//         .expect("failed to load test.js");
//
//     let comments = SingleThreadedComments::default();
//     let span = Span {
//         lo: BytePos(4641),
//         hi: BytePos(0),
//         ctxt: SyntaxContext::empty(),
//     };
//     let lexer = Lexer::new(
//         Syntax::Typescript(Default::default()),
//         Default::default(),
//         StringInput::from(&*fm),
//         Some(&comments),
//     );
//
//     let capturing = Capturing::new(lexer);
//
//     let mut parser = Parser::new_from(capturing);
//
//     for e in parser.take_errors() {
//         e.into_diagnostic(&handler).emit();
//     }
//
//     let _module = parser
//         .parse_typescript_module()
//         .map_err(|e| e.into_diagnostic(&handler).emit())
//         .expect("Failed to parse module.");
//
//     let test = parser.input().take();
//
//     for t in test {
//         println!("Tokens: {:?}", t);
//     }
//     let (a, b) = comments.borrow_all();
//     // for a1 in a.iter() {
//     //     println!("ComA: {:?}", a1);
//     // }
//
//     let b = a.iter().map(|(a, b)| b).collect::<Vec<_>>();
//     for b in b {
//         let b = b
//             .iter()
//             .filter(|comment| comment.kind == CommentKind::Line && comment.text.starts_with('/'));
//         for a2 in b {
//             println!("ComX: {:?}\n", a2);
//         }
//     }
// }

use std::{
    fmt::{self, Display, Formatter},
    io::{self, Write},
    sync::{Arc, RwLock},
};
use swc::{
    config::{Options, ParseOptions, SourceMapsConfig},
    Compiler,
};
use swc_common::comments::Comments;
use swc_common::errors::{Diagnostic, HandlerFlags};
use swc_common::{
    errors::{DiagnosticBuilder, Emitter, Handler, SourceMapperDyn},
    BytePos, FileName, FilePathMapping, SourceMap,
};
use swc_ecma_ast::EsVersion::Es2020;
use swc_ecma_ast::Program;
use swc_ecmascript::parser::{Syntax, TsConfig};

/// A buffer for collecting errors from the AST parser.
#[derive(Clone, Debug)]
pub struct SWCErrorBuffer {
    diagnostics: Arc<RwLock<Vec<Diagnostic>>>,
}

impl SWCErrorBuffer {
    pub fn new() -> Self {
        Self {
            diagnostics: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl Emitter for SWCErrorBuffer {
    fn emit(&mut self, diagnostic_builder: &DiagnosticBuilder) {
        self.diagnostics
            .write()
            .unwrap()
            .push((**diagnostic_builder).clone());
    }
}
impl Display for SWCErrorBuffer {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.diagnostics)
    }
}

/// Get global sourcemap
fn codemap() -> Arc<SourceMap> {
    Arc::new(SourceMap::new(FilePathMapping::empty()))
}
/// Creates a new handler which emits to returned buffer.
fn new_handler(_cm: Arc<SourceMapperDyn>) -> (Arc<Handler>, SWCErrorBuffer) {
    let buffered_error = SWCErrorBuffer::new();

    let handler = Handler::with_emitter_and_flags(
        Box::new(buffered_error.clone()),
        HandlerFlags {
            can_emit_warnings: true,
            treat_err_as_bug: false,
            dont_buffer_diagnostics: true,
            ..Default::default()
        },
    );

    (Arc::new(handler), buffered_error)
}

fn compiler() -> (Compiler, SWCErrorBuffer) {
    let cm = codemap();

    let (handler, errors) = new_handler(cm.clone());

    let c = Compiler::new(cm.clone(), handler);

    (c, errors)
}

fn main() {
    let s = r#"// Import 'start' function from denops_std
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
});"#;
    let (c, errors) = compiler();
    let opts = ParseOptions {
        comments: true,
        syntax: Syntax::Typescript(TsConfig {
            tsx: false,
            decorators: true,
            dynamic_import: false,
            dts: false,
            no_early_errors: false,
            import_assertions: false,
        }),
        is_module: true,
        target: Es2020,
    };

    let fm = c.cm.new_source_file(FileName::Anon, s.into());
    let program = c
        .parse_js(
            fm.clone(),
            opts.target,
            opts.syntax,
            opts.is_module,
            opts.comments,
        )
        .map_err(|err| format!("failed to parse: {}\n{}", err, errors));
    let program = program.unwrap();
    let stringifier = serde_json::to_string(&program);
    println!("{:?}", stringifier);
    let end = fm.clone().end_pos.0;
    for i in 0..end {
        if c.comments().has_trailing(BytePos(i)) {
            println!("{:?}", i);
        }
        // for comments in c.comments().has_trailing(BytePos(i)) {
        //     for c in comments {
        //         println!("{:?}", c);
        //     }
        // }
    }
}
