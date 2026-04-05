import { defineCommand, runMain } from "citty";
import add from "./commands/add.js";
import status from "./commands/status.js";
import open from "./commands/open.js";
import upgrade from "./commands/upgrade.js";

const main = defineCommand({
  meta: {
    name: "whop-kit",
    version: "0.2.0",
    description: "Manage your Whop project",
  },
  subCommands: {
    add,
    status,
    open,
    upgrade,
  },
});

runMain(main);
