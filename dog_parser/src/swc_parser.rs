use futures::future::LocalBoxFuture;
use swc_ecmascript::parser::Syntax;

use crate::errors::SWCDiagnosticBuffer;
use crate::swc::SWC;

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
