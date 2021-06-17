use crate::errors::{SWCDiagnosticBuffer, SWCErrorBuffer};
use crate::utils::Specifier;
use std::path::Path;
use std::rc::Rc;
use swc_common::{
    comments::SingleThreadedComments,
    errors::{Handler, HandlerFlags},
    FileName, Globals, SourceMap,
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
    /// we need globals to check instance is in top level of module or not.
    /// https://rustdoc.swc.rs/swc_ecma_transforms_base/resolver/fn.resolver_with_mark.html
    pub globals: Globals,
    // /// The marker passed to the resolver (from swc).
    // ///
    // /// This mark is applied to top level bindings and unresolved references.
    // pub(crate) top_level_mark: Mark,
}

impl SWC {
    /// - `specifier` - The module specifier for the module.
    /// - `source` - The source code for the module.
    pub fn parse(specifier: &str, source: &str) -> Result<Self, SWCDiagnosticBuffer> {
        // generate source map
        let source_map = SourceMap::default();
        let source_file = source_map.new_source_file(
            FileName::Real(Path::new(specifier).to_path_buf()),
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
        let module = parser.parse_module().map_err(move |err| {
            let mut diagnostic = err.into_diagnostic(&handler);
            diagnostic.emit();
            SWCDiagnosticBuffer::from_error_buffer(buffered_err, |span| {
                (&source_map).lookup_char_pos(span.lo)
            })
        })?;

        Ok(Self {
            specifier: specifier.into(),
            module,
            source_map: Rc::new(todo!()),
            comments: Default::default(),
            globals: Globals::new(),
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
    "#;
        let (code, _) = st("https://deno.land/x/mod.ts", source, false);
        assert!(code.contains("var D;\n(function(D) {\n"));
        assert!(code.contains("_applyDecoratedDescriptor("));
    }
}
