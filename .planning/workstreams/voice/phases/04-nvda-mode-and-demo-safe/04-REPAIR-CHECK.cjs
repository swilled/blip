// Static plan validation only. Never executes a command written in a plan.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dir = __dirname;
const names = ["04", "05", "06", "07", "08"].map(n => "04-" + n + "-PLAN.md");
const errors = [];
const records = names.map(name => {
  const text = fs.readFileSync(path.join(dir, name), "utf8");
  const header = text.split("---")[1];
  const list = field => {
    const block = header.match(new RegExp("^" + field + ":\\s*\\n((?:[ \\t]+[^\\n]*\\n?)*)", "m"));
    return block ? block[1].split("\n").map(x => x.trim()).filter(x => x.startsWith("- ")).map(x => x.slice(2).replace(/^"|"$/g, "")) : [];
  };
  const tasks = [...text.matchAll(/<task\b[^>]*>[\s\S]*?<\/task>/g)].map(x => x[0]);
  return {name, text, modified: list("files_modified"), deps: list("depends_on"), wave: Number(header.match(/^wave:\s*(\d+)/m)?.[1]), tasks};
});
const declared = new Set(records.flatMap(r => r.modified));
const checkedTargets = new Set();
const pending = new Set();
let commandCount = 0;
let taskCount = 0;
const checkPath = (target, where) => {
  checkedTargets.add(target);
  if (fs.existsSync(path.join(root, target))) return;
  if (declared.has(target)) pending.add(target);
  else errors.push(where + ": missing target " + target);
};
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const r of records) {
  if (!r.text.includes("gap_closure: true")) errors.push(r.name + ": missing gap_closure");
  if (!r.text.includes("Artifacts this phase produces")) errors.push(r.name + ": missing produced artifacts");
  for (const dep of r.deps) {
    if (!fs.existsSync(path.join(dir, dep + "-PLAN.md"))) errors.push(r.name + ": missing dependency " + dep);
    const earlier = records.find(other => other.name === dep + "-PLAN.md");
    if (earlier && earlier.wave >= r.wave) errors.push(r.name + ": non-earlier dependency wave");
  }
  for (const task of r.tasks) {
    taskCount++;
    for (const tag of ["name", "read_first", "files", "action", "acceptance_criteria", "verify", "done"]) {
      if (!new RegExp("<" + tag + ">[\\s\\S]+?<\/" + tag + ">").test(task)) errors.push(r.name + ": missing task " + tag);
    }
    const taskFiles = task.match(/<files>([\s\S]*?)<\/files>/)?.[1].split(",").map(x => x.trim()) ?? [];
    for (const file of taskFiles) {
      if (!r.modified.includes(file)) errors.push(r.name + ": task file absent from files_modified: " + file);
    }
    const commands = [...task.matchAll(/<automated>([\s\S]*?)<\/automated>/g)];
    if (commands.length && !/<fails_when>\s*\S/.test(task)) errors.push(r.name + ": no failure direction");
    for (const [, command] of commands) {
      commandCount++;
      for (const segment of command.split(";").map(x => x.trim())) {
        const test = segment.match(/^npm\.cmd\s+test(?:\s+--\s+(.+))?$/);
        if (test) {
          if (!rootPackage.scripts.test) errors.push("Root test script missing");
          for (const target of (test[1] ?? "").split(/\s+/).filter(Boolean)) checkPath(target, r.name);
          continue;
        }
        const run = segment.match(/^npm\.cmd\s+run\s+(\S+)(?:\s+--workspace\s+(\S+))?$/);
        if (run) {
          let manifest = rootPackage;
          if (run[2]) {
            if (run[2] !== "@blip/voice") errors.push("Unknown workspace: " + run[2]);
            manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/voice/package.json"), "utf8"));
          }
          if (!manifest.scripts?.[run[1]]) errors.push("Missing script: " + segment);
          continue;
        }
        if (!/^if\s*\(\$LASTEXITCODE -ne 0\)\s*\{\s*exit \$LASTEXITCODE\s*\}$/.test(segment)) {
          errors.push("Unrecognized verification segment, not executed: " + segment);
        }
      }
    }
  }
}
console.log(JSON.stringify({
  kind: "static_plan_check_only",
  plans: records.length,
  tasks: taskCount,
  automatedCommands: commandCount,
  distinctTargets: checkedTargets.size,
  existingTargets: checkedTargets.size - pending.size,
  declaredFutureTargets: [...pending],
  errors,
  applicationCommandsExecuted: 0,
  independentAgentReview: false
}, null, 2));
process.exitCode = errors.length ? 1 : 0;
