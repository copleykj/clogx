#!/usr/bin/env bun
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { simpleGit } from 'simple-git';
import { Command } from '@commander-js/extra-typings';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

const monthMap: Record<string, { prev: string, next: string, days: number, num: string }> = {
  'jan': { prev: 'dec', next: 'feb', days: 31, num: '1' },
  'feb': { prev: 'jan', next: 'mar', days: 29, num: '2' },
  'mar': { prev: 'feb', next: 'apr', days: 31, num: '3' },
  'apr': { prev: 'mar', next: 'may', days: 30, num: '4' },
  'may': { prev: 'apr', next: 'jun', days: 31, num: '5' },
  'jun': { prev: 'may', next: 'jul', days: 30, num: '6' },
  'jul': { prev: 'jun', next: 'aug', days: 31, num: '7' },
  'aug': { prev: 'jul', next: 'sep', days: 31, num: '8' },
  'sep': { prev: 'aug', next: 'oct', days: 30, num: '9' },
  'oct': { prev: 'sep', next: 'nov', days: 31, num: '10' },
  'nov': { prev: 'oct', next: 'dec', days: 30, num: '11' },
  'dec': { prev: 'nov', next: 'jan', days: 31, num: '12' },
};

const fullMonthMap: Record<string, string> = {
  'january': 'jan',
  'february': 'feb',
  'march': 'mar',
  'april': 'apr',
  'may': 'may',
  'june': 'jun',
  'july': 'jul',
  'august': 'aug',
  'september': 'sep',
  'october': 'oct',
  'november': 'nov',
  'december': 'dec',
};

const program = new Command()
  .requiredOption('-m, --month <month>', 'Month to display logs for')
  .requiredOption('--author <author>', 'Author to display logs for')
  .parse(process.argv);

const options = program.opts();
if (options && options.month && options.author) {
  const year = new Date().getFullYear();
  const month = options.month.toLowerCase();
  const author = options.author;

  const shortMonth = fullMonthMap[month];

  const monthOptions = shortMonth ? monthMap[shortMonth] : monthMap[month];

  if (!monthOptions) {
    console.log('Invalid month');
    process.exit(1);
  }

  const prevMonthOptions = monthMap[monthOptions.prev];

  const after = `${year}-${prevMonthOptions.num}-${prevMonthOptions.days}`;
  const until = `${year}-${monthOptions.num}-${monthOptions.days}`;

  const cwd = process.cwd();
  const files = await readdir(cwd, { withFileTypes: true });
  const dirs = files.filter(file => file.isDirectory()).map(file => file.name);

  const projectLogs = await Promise.all(dirs.sort().map(async (dir) => {
    const baseDir = path.join(cwd, dir);
    const git = simpleGit({ baseDir });

    if (await git.checkIsRepo()) {
      const { all } = await git.log({
        '--all': null,
        '--author': author,
        '--after': after,
        '--until': until,
        '--stat': null,
        'format': 'oneline',
        '-P': null,
      });
      if (!all.length) return;
      const projectCommits = all.map(commit => {
        const children = [];
        // @ts-ignore
        let commitMessage = `${commit.hash.substring(0, 7)} ${commit.message}`;
        children.push(new TextRun({
          text: commitMessage,
        }));
        if (commit.diff) {
          const diffInfo = `${commit.diff.changed} file${commit.diff.changed === 1 ? '' : 's'}, ${commit.diff.insertions} insertions(+), ${commit.diff.deletions} deletions(-)`;
          children.push(new TextRun({ break: 1 }));
          children.push(new TextRun({
            text: diffInfo,
          }));
        }
        children.push(new TextRun({ break: 1 }));
        return new Paragraph({ children });
      });

      return [
        new Paragraph({
          children: [
            new TextRun({
              text: dir,
              bold: true,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
        }),
        ...projectCommits,
      ];
    }
  }));

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'Commit Log',
                bold: true,
              }),
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          ...projectLogs.flat().filter(Boolean),
        ],
      },
    ],
  });

  const output = await Packer.toBuffer(doc);
  await writeFile('commit-log.docx', output);
  console.log('done!');
}
