"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = require("https");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const config_json_1 = require("./config.json");
var CliArgs;
(function (CliArgs) {
    CliArgs[CliArgs["RepoName"] = 2] = "RepoName";
})(CliArgs || (CliArgs = {}));
async function main() {
    // Argument validation
    const repoName = process.argv[CliArgs.RepoName];
    const validation = validateRepoName(repoName);
    if (validation === null || validation === void 0 ? void 0 : validation.error) {
        console.log(validation.error);
        process.exit();
    }
    const restOfTheArgs = process.argv.slice(CliArgs.RepoName + 1);
    const flags = parseFlags(restOfTheArgs); // todo, do something with these flags
    try {
        // XHR
        const pullRequests = await xhr(config_json_1.orgName, repoName, config_json_1.hostName, config_json_1.githubToken);
        const studentSubmissions = filterStudentsPullRequests(pullRequests, config_json_1.students);
        // Clone all student pull requests
        await cloneRepositories(repoName, config_json_1.hostName, studentSubmissions, config_json_1.students);
        logMissingSubmissions(studentSubmissions, config_json_1.students);
    }
    catch (err) {
        console.log(err);
        process.exit();
    }
}
// https://basarat.gitbook.io/typescript/type-system/exceptions#exceptional-cases
// Leverage TypeScript types over Error throwing
function validateRepoName(repoName) {
    if (!repoName) {
        return { error: 'No repository name supplied in arguments! Exiting...' };
    }
    // Look at first char only, enforce alphanumeric
    const startsWithWord = new RegExp(/^\w/);
    if (!startsWithWord.test(repoName)) {
        return { error: 'Invalid repository name! Exiting...' };
    }
    return {};
}
function parseFlags(args) {
    const flags = args.slice(CliArgs.RepoName + 1);
    // Starts with --, then any alphanumeric or hyphen - 
    return flags.filter(argv => argv.match(/^--[\w-]+/));
}
async function xhr(orgName, repoName, hostName, githubToken) {
    const options = {
        hostname: `api.${hostName}`,
        path: `/repos/${orgName}/${repoName}/pulls`,
        method: 'GET',
        headers: {
            'User-Agent': config_json_1.username,
            "Authorization": `token ${githubToken}`
        }
    };
    return new Promise((resolve, reject) => {
        https_1.get(options, res => {
            res.setEncoding('utf8');
            let body = '';
            let response;
            const tokenExpirationDate = res.headers['github-authentication-token-expiration'];
            notifyIfTokenExpiresSoon(tokenExpirationDate);
            res.on('data', data => {
                body += data;
            });
            res.on('end', () => {
                response = JSON.parse(body);
                // in operator type narrowing 
                // https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-in-operator-narrowing
                if ('message' in response) {
                    // reject GithubErrors
                    reject(`Warning: No repository found for: ${orgName}/${repoName}`);
                }
                else {
                    resolve(response);
                }
            });
            res.on('error', (err) => {
                reject(`Failed XHR, status code: ${res.statusCode} \n ${err}`);
            });
        });
    });
}
function notifyIfTokenExpiresSoon(tokenExpirationDate) {
    const milliseconds = new Date(tokenExpirationDate).getTime() - Date.now();
    const days = Math.floor(milliseconds / 1000 / 60 / 60 / 24);
    if (days < 7) {
        console.log('Heads up, your Personal Access Token is expiring in < 1 week');
    }
}
/**
 * Given an input array of GithubPRs, returns just the PRs from the tracked students
 */
function filterStudentsPullRequests(pullRequests, students) {
    var _a, _b, _c, _d;
    const submissions = [];
    const studentUsernames = students.map(({ username }) => username);
    const studentLookup = {};
    for (const student of students) {
        studentLookup[student.username] = student.name;
    }
    for (const pullRequest of pullRequests) {
        const username = (_b = (_a = pullRequest.user) === null || _a === void 0 ? void 0 : _a.login) !== null && _b !== void 0 ? _b : "no user found";
        // disallow PR from branches that aren't main or master
        if (((_c = pullRequest.head) === null || _c === void 0 ? void 0 : _c.ref) !== 'main' && ((_d = pullRequest.head) === null || _d === void 0 ? void 0 : _d.ref) !== 'master') {
            continue;
        }
        if (username in studentLookup) {
            submissions.push(pullRequest);
        }
    }
    return submissions;
}
// https://stackoverflow.com/questions/58570325/how-to-turn-child-process-spawns-promise-syntax-to-async-await-syntax
async function cloneRepositories(repoName, hostName, submissions, students) {
    // Todo: un-duplicate duplicated code
    const studentLookup = {};
    for (const student of students) {
        studentLookup[student.username] = student.name;
    }
    // mkdir if doesn't exist
    if (!fs_1.existsSync(repoName)) {
        fs_1.mkdirSync(repoName);
    }
    submissions.forEach(submission => {
        const repoPath = submission.base.repo.full_name;
        const studentName = studentLookup[submission.user.login];
        try {
            // Spawn process to git clone if folder doesn't exist. If folder exists, do nothing
            // Todo: pull down flag work from upstream
            if (!fs_1.existsSync(`${repoName}/${studentName}`)) {
                spawnProcess(repoName, repoPath, studentName, hostName);
            }
            else {
                console.log(`Folder already exists for ${studentName}. Skipping...`);
            }
        }
        catch (err) {
            console.log(err);
        }
    });
}
function spawnProcess(repoName, repoPath, studentName, hostName) {
    const cliCommand = `git clone git@${hostName}:${repoPath}.git ${repoName}/${studentName}`;
    const childProcess = child_process_1.spawn(cliCommand, { shell: true });
    childProcess.stdout.on('data', data => {
        console.log(data.toString().trim());
    });
    childProcess.stderr.on("data", data => {
        console.log(data.toString().trim());
        childProcess.kill();
    });
}
// print out which students didn't submit pull request submission
function logMissingSubmissions(submissions, students) {
    if (submissions.length !== students.length) {
        const githubUsernames = submissions.map(submission => submission.user.login); //array of github usernames that made submission
        const difference = students.filter(student => !githubUsernames.includes(student.username)); //array of students that didn't make submission
        let names = '';
        difference.forEach(student => (names += `${student.name} `));
        console.log(`Missing submissions from: ${names}`);
    }
}
main();
