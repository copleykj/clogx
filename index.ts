#!/usr/bin/env bun
import { readdir, writeFile, readFile, exists } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { GitPluginError, SimpleGit, simpleGit } from 'simple-git';
import { Command } from '@commander-js/extra-typings';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import libre from 'libreoffice-convert';
import { WakaTime } from "fozziejs";
import { parse, stringify } from 'ini';
import inquirer from 'inquirer';
import { format, subMonths, lastDayOfMonth
} from "date-fns";

let wakaTime: WakaTime;

const convertAsync = require('util').promisify(libre.convert);

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

const program = new Command('clogx')
  .requiredOption('-m, --month <month>', 'Month to display logs for')
  .option('-y, --year <year>', 'Year to display logs for')
  .option('--author <author>', 'Author to display logs for')
  .option('--pdf', 'Output as PDF')
  .option('--fetch', 'Fetch all remote work before generating logs')
  .option('--waka', 'Fetch time for each project from wakatime')
  .parse(process.argv);

const options = program.opts();
if (options && options.month) {
  const year = options.year || new Date().getFullYear();
  const month = options.month.toLowerCase();
  const author = options.author;

  const shortMonth = fullMonthMap[month];

  const monthOptions = shortMonth ? monthMap[shortMonth] : monthMap[month];

  if (!monthOptions) {
    console.log('Invalid month');
    process.exit(1);
  }

  // const prevMonthOptions = monthMap[monthOptions.prev];

  // const after = `${year}-${prevMonthOptions.num}-${prevMonthOptions.days}`;
  const until = format(lastDayOfMonth(`${year}-${monthOptions.num}-01`), 'yyyy-MM-dd');
  const after = format(lastDayOfMonth(subMonths(until, 1)), 'yyyy-MM-dd');

  const cwd = process.cwd();
  const files = await readdir(cwd, { withFileTypes: true });
  const dirs = files.filter(file => file.isDirectory()).map(file => file.name);

  const gitLogOptions = {
    '--all': null,
    ...(author ? {'--author': author} : {}),
    '--after': after,
    '--until': until,
    '--stat': null,
    'format': 'oneline',
    '-P': null,
  }
  console.log(Object.entries(gitLogOptions).map(([key, value]) => value ? `${key}=${value}` : key).join(' '));
  const projectLogs = await Promise.all(dirs.sort().map(async (dir) => {
    const baseDir = path.join(cwd, dir);
    const git = simpleGit({
      baseDir,
      timeout: {
        block: 5000,
      }
    });

    if (await git.checkIsRepo()) {
      options.fetch && await pullAllBranches(git, baseDir);
      const { all, total } = await git.log(gitLogOptions);
      console.log(`Found ${total} commits for ${dir}`);
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

      if (options.waka) {
        const projectTime = await getCumTimeForProject(dir, after, until);
        projectCommits.unshift(new Paragraph({
          children: [
            new TextRun({
              text: `Time in editor: ${projectTime}`,
              bold: true,
            }),
            new TextRun({ break: 1 }),
          ],
        }));
      }

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

  let output = await Packer.toBuffer(doc);
  if (options.pdf) {
    output = await convertAsync(output, '.pdf', undefined);
    await writeFile('commit-log.pdf', output);
  } else {
    await writeFile('commit-log.docx', output);
  }
  console.log('done!');
  process.exit(0);
}

async function pullAllBranches(git: SimpleGit, baseDir: string) {

  // Fetch all remote branches
  try {
    await git.fetch(['--all']);
  } catch (err) {
    if (err instanceof GitPluginError && err.plugin === 'timeout') {
      console.log('Timeout error occurred while fetching remote branches for', baseDir);
    }
  }

  // Get list of all branches
  const branchSummary = await git.branch(['-r']);
  const branches = branchSummary.all;

  for (const branch of branches) {
    // Skip the remote HEAD branch
    if (branch.includes('HEAD')) continue;

    // Extract branch name
    const remoteBranchName = branch.trim();
    const localBranchName = remoteBranchName.replace('origin/', '');

    // Check if the remote reference exists
    try {
      const remoteBranchExists = await git.raw(['ls-remote', '--heads', 'origin', localBranchName]);
      if (remoteBranchExists) {
        // Checkout the branch locally
        await git.checkout(localBranchName).catch(async (error) => {
          // Create and checkout if the branch does not exist locally
          if (error.message.includes('did not match any file(s) known to git')) {
            await git.checkout(['-b', localBranchName, remoteBranchName]);
          } else {
            throw error;
          }
        });

        // Pull the latest changes for the branch
        await git.pull('origin', localBranchName);
      } else {
        console.log(`Remote branch ${localBranchName} does not exist.`);
      }
    } catch (err) {
      if (err instanceof GitPluginError && err.plugin === 'timeout') {
        console.log('Timeout error occurred while checking if remote branch exists for', baseDir);
      }
    }


  }

  console.log('All remote branches have been pulled.');
}

async function initWakaTime() {
  if (wakaTime) return wakaTime;

  const configLocation = `${homedir()}/.wakatime.cfg`;
  const configExists = await exists(configLocation);
  if (configExists) {
    const wakaIni = await readFile(configLocation);
    const wakaConfig = parse(wakaIni.toString());
    wakaTime = new WakaTime(wakaConfig.settings.api_key);
    return wakaTime;
  } else {
    // use inquirer to ask user for wakatime api key
    const { apiKey } = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your WakaTime API key',
      },
    ]);
    const wakaConfig = {
      settings: {
        api_key: apiKey,
      },
    };
    const wakaIni = stringify(wakaConfig);
    await writeFile(configLocation, wakaIni);
    console.log(`WakaTime API key saved to ${configLocation}. Other applications such as VSCode will use the key from this file as well.`);
    wakaTime = new WakaTime(apiKey);

    return wakaTime;
  }

}

async function getCumTimeForProject(project: string, after: string, until: string) {
  const wakaTime = await initWakaTime();
  const projectSummary = await wakaTime.getSummaries({ start: after, end: until, project });
  return projectSummary.cumulative_total.text;
}
