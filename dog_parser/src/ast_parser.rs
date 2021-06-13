// This module is based from `deno_doc::swc_utils`.
//
// Copyright of original one is below.
// Copyright 2020-2021 the Deno authors. All rights reserved. MIT license.

use std::{
    borrow::Borrow,
    error::Error,
    fmt,
    path::Path,
    rc::Rc,
    sync::{Arc, RwLock},
};
use swc_common::{
    self,
    comments::{Comment, CommentKind, Comments, SingleThreadedComments},
    errors::{ColorConfig, Diagnostic, DiagnosticBuilder, Emitter, Handler, HandlerFlags},
    BytePos, FileName, Globals, Mark, SourceMap, Span, SyntaxContext,
};
use swc_ecmascript::parser::{
    lexer::Lexer, Capturing, JscTarget, Parser, StringInput, Syntax, TsConfig,
};

pub fn get_default_ts_config() -> Syntax {
    let ts_config = TsConfig {
        dynamic_import: true,
        decorators: true,
        ..Default::default()
    };
    Syntax::Typescript(ts_config)
}

#[derive(Clone, Debug)]
pub struct SwcDiagnosticBuffer {
    pub diagnostics: Vec<String>,
}

impl Error for SwcDiagnosticBuffer {}

impl fmt::Display for SwcDiagnosticBuffer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let msg = self.diagnostics.join(",");

        f.pad(&msg)
    }
}

impl SwcDiagnosticBuffer {
    // TODO: check unwrap and Arc are better than Rc
    pub(crate) fn from_swc_error(error_buffer: SwcErrorBuffer, parser: &AstParser) -> Self {
        let s = error_buffer.0.read().unwrap().clone();

        let diagnostics = s
            .iter()
            .map(|d| {
                let mut msg = d.message();

                if let Some(span) = d.span.primary_span() {
                    let location = parser.get_span_location(span);
                    let filename = match &location.file.name {
                        FileName::Custom(n) => n,
                        _ => unreachable!(),
                    };
                    msg = format!(
                        "{} at {}:{}:{}",
                        msg, filename, location.line, location.col_display
                    );
                }

                msg
            })
            .collect::<Vec<String>>();

        Self { diagnostics }
    }
}

#[derive(Clone)]
pub struct SwcErrorBuffer(Arc<RwLock<Vec<Diagnostic>>>);

impl SwcErrorBuffer {
    pub fn default() -> Self {
        Self(Arc::new(RwLock::new(vec![])))
    }
}

impl Emitter for SwcErrorBuffer {
    fn emit(&mut self, db: &DiagnosticBuilder) {
        self.0.write().unwrap().push((**db).clone());
    }
}

/// Low-level utility structure with common AST parsing functions.
///
/// Allows to build more complicated parser by providing a callback
/// to `parse_module`.
pub struct AstParser {
    pub buffered_error: SwcErrorBuffer,
    pub source_map: Rc<SourceMap>,
    pub handler: Handler,
    pub comments: SingleThreadedComments,
    pub globals: Globals,
    /// The marker passed to the resolver (from swc).
    ///
    /// This mark is applied to top level bindings and unresolved references.
    pub(crate) top_level_mark: Mark,
}

impl AstParser {
    pub(crate) fn new() -> Self {
        let buffered_error = SwcErrorBuffer::default();

        let handler = Handler::with_emitter_and_flags(
            Box::new(buffered_error.clone()),
            HandlerFlags {
                dont_buffer_diagnostics: true,
                can_emit_warnings: true,
                ..Default::default()
            },
        );

        let globals = Globals::new();
        let top_level_mark = swc_common::GLOBALS.set(&globals, || Mark::fresh(Mark::root()))

        AstParser {
            buffered_error,
            source_map: Rc::new(SourceMap::default()),
            handler,
            comments: SingleThreadedComments::default(),
            globals,
            top_level_mark,
        }
    }

    pub fn parse_module(
        &self,
        file_name: &str,
        syntax: Syntax,
        source_code: &str,
    ) -> Result<swc_ecmascript::ast::Module, SwcDiagnosticBuffer> {
        let swc_source_file = self.source_map.new_source_file(
            FileName::Custom(file_name.to_string()),
            source_code.to_string(),
        );

        let buffered_err = self.buffered_error.clone();

        let lexer = Lexer::new(
            syntax,
            JscTarget::Es2019,
            StringInput::from(&*swc_source_file),
            Some(&self.comments),
        );

        let mut parser = Parser::new_from(lexer);

        parser.parse_module().map_err(move |err| {
            let mut diagnostic = err.into_diagnostic(&self.handler);
            diagnostic.emit();
            SwcDiagnosticBuffer::from_swc_error(buffered_err, self)
        })
    }

    pub fn get_span_location(&self, span: Span) -> swc_common::Loc {
        self.source_map.lookup_char_pos(span.lo())
    }

    pub fn get_span_comments(&self, span: Span) -> Vec<swc_common::comments::Comment> {
        self.comments
            .with_leading(span.lo(), |comments| comments.to_vec())
    }
}
