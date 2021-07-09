import { Denops } from "https://deno.land/x/denops_std@v1.0.0-beta.0/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v1.0.0-beta.0/helper/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v1.0.0-beta.0/variable/mod.ts";
import * as autocmd from "https://deno.land/x/denops_std@v1.0.0-beta.0/autocmd/mod.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v0.1.1/mod.ts";
import { run } from "./swc.ts";

export async function main(denops: Denops) {
  denops.dispatcher = {
    async remote(path: unknown): Promise<void> {
      ensureString(path);
      const text = await (await fetch(path)).text();
      // const text = await Deno.readTextFile(path);

      const result = run(text);
      // Use `cmd` to execute Vim's command
      await denops.cmd(`redraw | echomsg message`, {
        message: result,
      });
    },
    async local(path: unknown): Promise<void> {
      ensureString(path);
      const text = await Deno.readTextFile(path);

      const result = run(text);
      // Use `cmd` to execute Vim's command
      await denops.cmd(`redraw | echomsg message`, {
        message: result,
      });
    },
  };

  // Use 'execute()' to execute multiline Vim script
  await execute(
    denops,
    `
    command! TestLocal call denops#notify("${denops.name}", "local", ["./denops/dps-dog/main.ts"])
    command! TestRemote call denops#notify("${denops.name}", "remote", ["https://raw.githubusercontent.com/vim-denops/denops-helloworld.vim/main/denops/helloworld/main.ts"])
    `,
  );
  console.debug("dps-dog loaded");
}
