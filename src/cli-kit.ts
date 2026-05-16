import { defineCommand, runMain } from "citty";
import add from "./commands/add.js";
import status from "./commands/status.js";
import env from "./commands/env.js";
import catalog from "./commands/catalog.js";
import deploy from "./commands/deploy.js";
import open from "./commands/open.js";
import upgrade from "./commands/upgrade.js";
import doctor from "./commands/doctor.js";
import dev from "./commands/dev.js";

const main = defineCommand({
  meta: {
    name: "whop-kit",
    version: "1.0.0",
    description: "Manage your Whop project",
  },
  subCommands: {
    add,
    dev,
    doctor,
    status,
    env,
    catalog,
    deploy,
    open,
    upgrade,
  },
});

runMain(main);
