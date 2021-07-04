use crate::utils::Specifier;
use std::{fmt, sync::Arc, sync::RwLock};
use swc_common::{
    errors::{Diagnostic, DiagnosticBuilder, Emitter},
    Loc, Span,
};

/// A buffer for collecting errors from the AST parser.
#[derive(Clone, Debug)]
pub struct SWCErrorBuffer {
    specifier: Specifier,
    diagnostics: Arc<RwLock<Vec<Diagnostic>>>,
}

impl SWCErrorBuffer {
    pub fn new(specifier: Specifier) -> Self {
        Self {
            specifier: specifier.into(),
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

/// A buffer for collecting diagnostic messages from the AST parser.
#[derive(Debug)]
pub struct SWCDiagnosticBuffer {
    pub diagnostics: Vec<String>,
}

impl fmt::Display for SWCDiagnosticBuffer {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.pad(&self.diagnostics.join(","))
    }
}

impl SWCDiagnosticBuffer {
    pub fn from_error_buffer<F>(error_buffer: SWCErrorBuffer, get_loc: F) -> Self
    where
        F: Fn(Span) -> Loc,
    {
        let diagnostics = error_buffer.diagnostics.read().unwrap().clone();
        let diagnostics = diagnostics
            .iter()
            .map(|d| {
                let mut message = d.message();
                if let Some(span) = d.span.primary_span() {
                    let location = get_loc(span);
                    message = format!(
                        "{} at {}:{}:{}",
                        message, error_buffer.specifier, location.line, location.col_display
                    );
                }
                message
            })
            .collect();

        Self { diagnostics }
    }
}

impl std::error::Error for SWCDiagnosticBuffer {}
