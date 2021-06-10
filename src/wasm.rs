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

// #[wasm_bindgen(js_name = "parseSync")]
// pub fn parse_sync(s: &str, opts: JsValue) -> Result<JsValue, JsValue> {
//     console_error_panic_hook::set_once();
//
//     let opts: ParseOptions = opts
//         .into_serde()
//         .map_err(|err| format!("failed to parse swc options: {}", err))?;
//
//     let (c, errors) = compiler();
//
//     let fm = c.cm.new_source_file(FileName::Anon, s.into());
//     let program = c
//         .parse_js(fm, opts.target, opts.syntax, opts.is_module, opts.comments)
//         .map_err(|err| format!("failed to parse: {}\n{}", err, errors))?;
//
//     Ok(JsValue::from_serde(&program).map_err(|err| format!("failed to return value: {}", err))?)
// }

fn parse(s: &str) -> Result<String, JsValue> {
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
