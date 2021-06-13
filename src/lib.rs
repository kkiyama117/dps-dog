// mod wasm;

#[cfg(test)]
mod tests {
    use crate::demo;

    #[test]
    fn it_works() {
        demo();
        assert_eq!(2 + 2, 4);
    }
}

use std::{path::Path, sync::Arc};
use swc::{self, config::Options};
use swc_common::{
    errors::{ColorConfig, Handler},
    SourceMap,
};

fn demo() {
    let cm = Arc::<SourceMap>::default();
    let handler = Arc::new(Handler::with_tty_emitter(
        ColorConfig::Auto,
        true,
        false,
        Some(cm.clone()),
    ));
    let c = swc::Compiler::new(cm.clone(), handler.clone());

    let fm = cm
        .load_file(Path::new("./examples/app.ts"))
        .expect("failed to load file");

    c.process_js_file(
        fm,
        &Options {
            ..Default::default()
        },
    )
    .expect("failed to process file");
}
