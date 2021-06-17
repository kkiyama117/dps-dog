// mod wasm;

#[cfg(test)]
mod tests {
    // use crate::demo;

    #[test]
    fn it_works() {
        // demo();
        assert_eq!(2 + 2, 4);
    }
}

// use std::{path::Path, sync::Arc};
// use swc::{self, config::Options};
// use swc_common::{
//     errors::{ColorConfig, Handler},
//     SourceMap,
// };
// use swc_ecmascript::parser::{lexer::Lexer, Capturing, Parser, StringInput, Syntax};
//
// fn demo() {
//     let cm = Arc::<SourceMap>::default();
//     let handler = Arc::new(Handler::with_tty_emitter(
//         ColorConfig::Auto,
//         true,
//         false,
//         Some(cm.clone()),
//     ));
//     let c = swc::Compiler::new(cm.clone(), handler.clone());
//
//     let fm = cm
//         .load_file(Path::new("./examples/_app.js"))
//         .expect("failed to load file");
//
//     // c.process_js_file(
//     //     fm,
//     //     &Options {
//     //         ..Default::default()
//     //     },
//     // )
//     // .expect("failed to process file");
//     let lexer = Lexer::new(
//         Syntax::Es(Default::default()),
//         Default::default(),
//         StringInput::from(&*fm),
//         None,
//     );
//     let capturing = Capturing::new(lexer);
//
//     let mut parser = Parser::new_from(capturing);
//
//     for e in parser.take_errors() {
//         e.into_diagnostic(&handler).emit();
//     }
//
//     let _module = parser
//         .parse_module()
//         .map_err(|e| e.into_diagnostic(&handler).emit())
//         .expect("Failed to parse module.");
//
//     println!("Tokens: {:?}", parser.input().take());
// }
