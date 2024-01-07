const { readFile, writeFile, readdir } = require('fs/promises')
const { join, basename } = require("path");
const core = require("@actions/core");
const $ = require("@tomsun28/google-translate-api");
const unified = require("unified");
const parse = require("remark-parse");
const stringify = require("remark-stringify");
const visit = require("unist-util-visit");
const simpleGit = require("simple-git");
const git = simpleGit();

const toAst = (markdown) => {
  return unified().use(parse).parse(markdown);
};

const toMarkdown = (ast) => {
  return unified().use(stringify).stringify(ast);
};

const LANG = core.getInput("LANG") || "zh-CN";
const FILENAME = core.getInput("README.md") || "README.md";

async function writeToFile(lang, filename = 'README.md') {
  const fileBasename = basename(filename)
  const mainDir = ".";
  const filenames = await readdir(mainDir);
  const README = filenames.find(
    (f) => f.toUpperCase() === filename.toUpperCase()
  );
  if (!README) {
    throw new Error(`No ${filename} file found`);
  }
  const readme = await readFile(join(mainDir, README), { encoding: "utf8" });
  const readmeAST = toAst(readme);
  core.info("AST CREATED AND READ");

  let originalText = [];

  visit(readmeAST, async (node) => {
    if (node.type === "text") {
      originalText.push(node.value);
      node.value = (await $(node.value, { to: lang })).text;
    }
  });

  const translatedText = originalText.map(async (text) => {
    return (await $(text, { to: lang })).text;
  });

  await Promise.all(translatedText);
  const toFilename = `${fileBasename}_${lang}.md`
  await writeFile(
    join(mainDir, toFilename),
    toMarkdown(readmeAST),
    "utf8"
  );
  core.info(`${toFilename} written`);
  return toFilename
}

async function commitChanges(lang, toFilename = `README_${lang}.md`) {
  core.info("commit started");
  const status = await git.status();
  if (status.files.some((file) => file.path === toFilename)) {
    await git.addConfig("user.name", "github-actions[bot]");
    await git.addConfig(
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com"
    );
    await git.add(toFilename);
    await git.commit(
      `docs: add new "${toFilename}" translation form robot [skip ci]`
    );
    core.info("finished commit");
    await git.push();
    core.info("pushed");
  } else {
    core.info("No changes to commit");
  }
}

async function translateFile() {
  try {
    const toFilename = await writeToFile(LANG, FILENAME);
    await commitChanges(LANG, toFilename);
    core.info("Done");
  } catch (error) {
    throw new Error(error);
  }
}

translateFile();
