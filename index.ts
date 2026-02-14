import fs from "node:fs/promises";
import path from "node:path";

console.log(
  "\n" +
    "--------------------------------\n" +
    "⚒️  Welcome to vscode-custom-ui!\n" +
    "--------------------------------\n",
);

const appData = path.resolve(process.env.APPDATA!, "..", "Local", "Programs");

const installationRoots = [
  path.join("C:", "Program Files", "Microsoft VS Code Insiders"),
  path.join(appData, "Microsoft VS Code"),
  path.join(appData, "Microsoft VS Code Insiders"),
  path.join(appData, "Antigravity"),
];

const excludedSubfolders = new Set(["bin"]);
const workbenchRelative = path.join(
  "resources",
  "app",
  "out",
  "vs",
  "workbench",
);
const targetFiles = ["workbench.desktop.main.css", "workbench.desktop.main.js"];
const customCssPath = path.resolve("custom.css");
const customCssStart = "/* vscode-custom-ui:custom.css:start */";
const customCssEnd = "/* vscode-custom-ui:custom.css:end */";
let customCssCache: string | null | undefined = undefined;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listSubfolders(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !excludedSubfolders.has(name.toLowerCase()));
}

async function getCustomCss(): Promise<string | null> {
  if (customCssCache !== undefined) return customCssCache;

  try {
    const content = await fs.readFile(customCssPath, "utf8");
    customCssCache = content;
    return content;
  } catch {
    customCssCache = null;
    return null;
  }
}

function removeCustomCssBlock(content: string): string {
  const startIndex = content.indexOf(customCssStart);
  if (startIndex === -1) return content;

  const endIndex = content.indexOf(customCssEnd, startIndex);
  if (endIndex === -1) return content;

  const afterEnd = endIndex + customCssEnd.length;
  return content.slice(0, startIndex).trimEnd() + content.slice(afterEnd);
}

function injectCustomCss(content: string, customCss: string): string {
  const trimmedCustomCss = customCss.trimEnd();
  if (trimmedCustomCss.length === 0) return content;

  const cleaned = removeCustomCssBlock(content);
  const needsNewline = cleaned.length > 0 && !cleaned.endsWith("\n");
  const prefix = needsNewline ? "\n" : "";

  return (
    cleaned +
    prefix +
    "\n" +
    customCssStart +
    "\n" +
    trimmedCustomCss +
    "\n" +
    customCssEnd +
    "\n"
  );
}

async function applyWorkbenchReplacements(
  content: string,
  fileName: string,
): Promise<string> {
  let next = content;

  if (fileName === "workbench.desktop.main.js") {
    next = next.replace("BLINK_INTERVAL=500", "BLINK_INTERVAL=140");
  }

  if (fileName === "workbench.desktop.main.css") {
    const customCss = await getCustomCss();
    if (customCss) {
      next = injectCustomCss(next, customCss);
    }
  }

  return next;
}

async function patchFile(filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;

  const original = await fs.readFile(filePath, "utf8");
  const fileName = path.basename(filePath);
  const updated = await applyWorkbenchReplacements(original, fileName);

  if (updated !== original) {
    const backupPath = `${filePath}.bkp`;
    await fs.writeFile(backupPath, original, "utf8");
    await fs.writeFile(filePath, updated, "utf8");
    return true;
  }

  return false;
}

async function processInstallation(root: string): Promise<number> {
  if (!(await pathExists(root))) return 0;

  const subfolders = await listSubfolders(root);
  let changes = 0;

  for (const sub of [...subfolders, root]) {
    const workbenchDir = path.join(root, sub, workbenchRelative);
    if (!(await pathExists(workbenchDir))) continue;

    for (const file of targetFiles) {
      const filePath = path.join(workbenchDir, file);
      if (await patchFile(filePath)) {
        changes += 1;
        console.log(`[vscode-custom-ui] Atualizado: ${filePath}`);
      }
    }
  }

  return changes;
}

async function main(): Promise<void> {
  let totalChanges = 0;

  for (const root of installationRoots) {
    totalChanges += await processInstallation(root);
  }

  if (totalChanges > 0) {
    console.log(
      `[vscode-custom-ui] Concluído: ${totalChanges} arquivo(s) modificado(s).`,
    );
  } else {
    console.log("[vscode-custom-ui] Nenhuma alteração necessária.");
  }
}

main().catch((err) => {
  console.error("Erro ao processar instalações:", err);
});
