use futures::future::LocalBoxFuture;
use swc_ecmascript::parser::Syntax;
use thiserror::Error;

use crate::errors::SWCDiagnosticBuffer;
use crate::swc::SWC;

#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum DocError {
    #[error("{0}")]
    Resolve(String),
    #[error("{0}")]
    Io(std::io::Error),
    #[error("{0}")]
    Parse(SWCDiagnosticBuffer),
}

impl From<SWCDiagnosticBuffer> for DocError {
    fn from(error: SWCDiagnosticBuffer) -> DocError {
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

/// DogParser parses scripts with SWC AST parser and tries to get info
/// from node tree and comments.
#[derive(Clone)]
pub struct DogParser {
    ast_tokenizer: SWC,
    private: bool,
}

impl DogParser {
    /// initialize Parser
    ///
    /// This method may return Error, from which swc throws in generating AST of Typescript file.
    pub fn initialize(specifier: &str, source: &str) -> Result<Self, anyhow::Error> {
        Ok(Self {
            ast_tokenizer: SWC::parse(specifier, source)?,
            private: true,
        })
    }

    /// show inner parser powered by swc.
    pub fn inner(&self) -> SWC {
        self.ast_tokenizer.clone()
    }
}
