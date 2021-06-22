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

        let buffered_error = SWCErrorBuffer::new(specifier);
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
            comments: Default::default(),
            // globals: Globals::new(),
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
      enum D {
        A,
        B,
        C,
      }
      function enumerable(value: boolean) {
        return function (
          _target: any,
          _propertyKey: string,
          descriptor: PropertyDescriptor,
        ) {
          descriptor.enumerable = value;
        };
      }
      export class A {
        private b: string;
        protected c: number = 1;
        e: "foo";
        constructor (public d = D.A) {
          const e = "foo" as const;
          this.e = e;
        }
        @enumerable(false)
        bar() {}
      }
      
      // call it
      enumerable(true);
    "#;
        // let (code, _) = st("https://deno.land/x/mod.ts", source, false);
        // assert!(code.contains("var D;\n(function(D) {\n"));
        // assert!(code.contains("_applyDecoratedDescriptor("));
        let tester = SWC::parse("test.ts", source).unwrap();
        for i in tester.module.body {
            println!("{:?}", serde_json::to_string(&i));
        }
        assert_eq!(1 + 1, 2);
    }
}
