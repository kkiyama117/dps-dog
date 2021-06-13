use futures::future::LocalBoxFuture;
use swc_ecmascript::parser::Syntax;
use thiserror::Error;

use crate::ast_parser;

#[derive(Error, Debug)]
pub enum DocError {
    #[error("{0}")]
    Resolve(String),
    #[error("{0}")]
    Io(std::io::Error),
    #[error("{0}")]
    Parse(ast_parser::SwcDiagnosticBuffer),
}

impl From<ast_parser::SwcDiagnosticBuffer> for DocError {
    fn from(error: ast_parser::SwcDiagnosticBuffer) -> DocError {
        DocError::Parse(error)
    }
}

pub trait DocFileLoader {
    fn resolve(&self, specifier: &str, referrer: &str) -> Result<String, DocError>;

    fn load_source_code(
        &self,
        specifier: &str,
    ) -> LocalBoxFuture<Result<(Syntax, String), DocError>>;
}

#[derive(Clone)]
enum ImportKind {
    Namespace(String),
    Named(String, Option<String>),
}

#[derive(Clone)]
struct Import {
    src: String,
    kind: ImportKind,
}

pub struct DocParser {
    pub ast_parser: AstParser,
    pub loader: Box<dyn DocFileLoader>,
    pub private: bool,
}

impl DocParser {
    pub fn new(loader: Box<dyn DocFileLoader>) -> Self {
        Self {
            ast_parser: Default::default(),
            loader,
            private: true,
        }
    }
}
