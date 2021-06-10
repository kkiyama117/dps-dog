use std::borrow::Borrow;
use std::path::Path;
use swc_common::comments::{Comment, CommentKind, Comments, SingleThreadedComments};
use swc_common::{
    self,
    errors::{ColorConfig, Handler},
    sync::Lrc,
    BytePos, FileName, SourceMap, Span, SyntaxContext,
};
use swc_ecmascript::parser::{lexer::Lexer, Capturing, Parser, StringInput, Syntax};

fn main() {
    let cm: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

    // Real usage
    let fm = cm
        .load_file(Path::new("examples/app.ts"))
        .expect("failed to load test.js");

    let comments = SingleThreadedComments::default();
    let span = Span {
        lo: BytePos(4641),
        hi: BytePos(0),
        ctxt: SyntaxContext::empty(),
    };
    let lexer = Lexer::new(
        Syntax::Typescript(Default::default()),
        Default::default(),
        StringInput::from(&*fm),
        Some(&comments),
    );

    let capturing = Capturing::new(lexer);

    let mut parser = Parser::new_from(capturing);

    for e in parser.take_errors() {
        e.into_diagnostic(&handler).emit();
    }

    let _module = parser
        .parse_typescript_module()
        .map_err(|e| e.into_diagnostic(&handler).emit())
        .expect("Failed to parse module.");

    let test = parser.input().take();

    for t in test {
        println!("Tokens: {:?}", t);
    }
    let (a, b) = comments.borrow_all();
    // for a1 in a.iter() {
    //     println!("ComA: {:?}", a1);
    // }

    let b = a.iter().map(|(a, b)| b).collect::<Vec<_>>();
    for b in b {
        let b = b
            .iter()
            .find(|comment| comment.kind == CommentKind::Block && comment.text.starts_with('*'));
        for a2 in b {
            println!("ComX: {:?}", a2);
        }
    }
}
