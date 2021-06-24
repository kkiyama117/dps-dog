pub mod errors;
mod parser;
pub mod swc;
mod utils;

use serde::Deserialize;

// #[cfg(test)]
// mod tests {
//     #[test]
//     fn it_works() {
//         assert_eq!(2 + 2, 4);
//     }
// }
#[cfg(feature = "serde")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Options {
    // #[serde(default)]
    // pub import_map: ImportHashMap,
    #[serde(default)]
    pub swc_options: SWCOptions,
}

#[cfg(feature = "serde")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SWCOptions {}

#[cfg(feature = "serde")]
impl Default for SWCOptions {
    fn default() -> Self {
        SWCOptions {}
    }
}
