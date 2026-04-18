import { chromium, type BrowserContext, type Page } from "playwright";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

const SELECTORS = {
  twitter: {
    composeTextbox: '[data-testid="tweetTextarea_0"] [role="textbox"]',
    postButton: '[data-testid="tweetButtonInline"]',
    tweetLink: '[data-testid="tweet"] a[href*="/status/"]',
    replyTextbox: '[data-testid="tweetTextarea_0"] [role="textbox"]',
    replyButton: '[data-testid="tweetButton"]',
    composeUrl: "https://x.com/compose/post",
    tweetArticle: 'article[data-testid="tweet"]',
  },
  linkedin: {
    startPostButton: 'button:has-text("Start a post")',
    postTextbox: 'div.ql-editor[role="textbox"]',
    postButton: 'button.share-actions__primary-action:has-text("Post")',
    feedUrl: "https://www.linkedin.com/feed/",
  },
} as const;

const THREAD_DELIMITER = /^---+$|^(?:Tweet\s+)?\d+[.):\/]/m;
const INTER_TWEET_DELAY_MS = 30_000;

interface Options {
  platform: "twitter" | "linkedin";
  thread: boolean;
  dryRun: boolean;
  inputPath?: string;
}

function parseOptions(): Options {
  const { values, positionals } = parseArgs({
    options: {
      platform: { type: "string", short: "p" },
      thread: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const platform = values.platform as string | undefined;
  if (platform !== "twitter" && platform !== "linkedin") {
    console.error(
      `Error: --platform must be "twitter" or "linkedin", got "${platform ?? '(none)'}"`
    );
    process.exit(1);
  }

  return {
    platform,
    thread: values.thread ?? false,
    dryRun: values["dry-run"] ?? false,
    inputPath: positionals[0],
  };
}

function printUsage(): void {
  const lines = [
    "Usage: npx ts-node scripts/social-post.ts [options] [file]",
    "",
    "Options:",
    "  --platform, -p  twitter|linkedin  (required)",
    "  --thread        Post as a thread (Twitter only)",
    "  --dry-run       Fill fields but do not submit",
    "  --help, -h      Show this message",
    "",
    "Input:",
    "  Reads from file argument or stdin.",
    '  For threads, split posts with "---" or numbered markers.',
    "",
    "Examples:",
    "  npx ts-node scripts/social-post.ts --platform twitter --thread < drafts/thread.txt",
    "  npx ts-node scripts/social-post.ts --platform linkedin drafts/post.md",
    "  npx ts-node scripts/social-post.ts --platform twitter --dry-run < drafts/test.txt",
  ];
  console.log(lines.join("\n"));
}

function readInput(inputPath?: string): string {
  if (inputPath) {
    return readFileSync(resolve(inputPath), "utf-8").trim();
  }

  if (process.stdin.isTTY) {
    console.error("Error: no input. Pipe text via stdin or pass a file path.");
    process.exit(1);
  }

  return readFileSync(0, "utf-8").trim();
}

function splitThread(text: string): string[] {
  const parts = text
    .split(THREAD_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    console.error("Error: thread input produced zero posts after splitting.");
    process.exit(1);
  }
  return parts;
}

function getBrowserProfileDir(): string {
  const envDir = process.env.SOCIAL_POST_PROFILE_DIR;
  if (envDir) return resolve(envDir);

  const platform = process.platform;
  if (platform === "win32") {
    return join(
      homedir(),
      "AppData",
      "Local",
      "ambr-social-poster",
      "chromium-profile"
    );
  }
  return join(homedir(), ".config", "ambr-social-poster", "chromium-profile");
}

async function launchBrowser(): Promise<BrowserContext> {
  const profileDir = getBrowserProfileDir();
  console.log(`Browser profile: ${profileDir}`);

  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeHumanLike(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  const el = page.locator(selector);
  await el.waitFor({ state: "visible", timeout: 15_000 });
  await el.click();
  await sleep(300);
  await el.fill(text);
  await sleep(500);
}

async function postToTwitter(
  ctx: BrowserContext,
  posts: string[],
  dryRun: boolean
): Promise<void> {
  const page = await ctx.newPage();

  await page.goto(SELECTORS.twitter.composeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await sleep(2000);

  const loggedIn = await page
    .locator(SELECTORS.twitter.composeTextbox)
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!loggedIn) {
    console.error(
      "Not logged in to Twitter/X. Log in manually in the browser profile first."
    );
    await page.close();
    process.exit(1);
  }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const isFirst = i === 0;

    if (!isFirst) {
      console.log(
        `Waiting ${INTER_TWEET_DELAY_MS / 1000}s before next tweet...`
      );
      await sleep(INTER_TWEET_DELAY_MS);

      const lastTweetLink = page
        .locator(SELECTORS.twitter.tweetLink)
        .last();
      const tweetUrl = await lastTweetLink
        .getAttribute("href", { timeout: 10_000 })
        .catch(() => null);

      if (tweetUrl) {
        const fullUrl = tweetUrl.startsWith("http")
          ? tweetUrl
          : `https://x.com${tweetUrl}`;
        await page.goto(fullUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await sleep(2000);

        await typeHumanLike(
          page,
          SELECTORS.twitter.replyTextbox,
          post
        );
      } else {
        console.warn(
          `Could not find previous tweet link for reply ${i + 1}. Posting as standalone.`
        );
        await page.goto(SELECTORS.twitter.composeUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await sleep(2000);
        await typeHumanLike(
          page,
          SELECTORS.twitter.composeTextbox,
          post
        );
      }
    } else {
      await typeHumanLike(page, SELECTORS.twitter.composeTextbox, post);
    }

    const charCount = post.length;
    console.log(
      `[${i + 1}/${posts.length}] Filled tweet (${charCount} chars)${dryRun ? " [DRY RUN]" : ""}`
    );

    if (!dryRun) {
      const postBtn = isFirst
        ? page.locator(SELECTORS.twitter.postButton)
        : page.locator(SELECTORS.twitter.replyButton);

      await postBtn.waitFor({ state: "visible", timeout: 5_000 });
      await postBtn.click();
      await sleep(3000);
      console.log(`  Posted tweet ${i + 1}.`);
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. Browser left open for inspection.");
    console.log("Press Ctrl+C to exit.");
    await sleep(600_000);
  }

  await page.close();
}

async function postToLinkedIn(
  ctx: BrowserContext,
  text: string,
  dryRun: boolean
): Promise<void> {
  const page = await ctx.newPage();

  await page.goto(SELECTORS.linkedin.feedUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await sleep(3000);

  const feedVisible = await page
    .locator(SELECTORS.linkedin.startPostButton)
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!feedVisible) {
    console.error(
      "Not logged in to LinkedIn. Log in manually in the browser profile first."
    );
    await page.close();
    process.exit(1);
  }

  await page.locator(SELECTORS.linkedin.startPostButton).click();
  await sleep(2000);

  await typeHumanLike(page, SELECTORS.linkedin.postTextbox, text);

  console.log(
    `Filled LinkedIn post (${text.length} chars)${dryRun ? " [DRY RUN]" : ""}`
  );

  if (!dryRun) {
    const postBtn = page.locator(SELECTORS.linkedin.postButton);
    await postBtn.waitFor({ state: "visible", timeout: 5_000 });
    await postBtn.click();
    await sleep(3000);
    console.log("Posted to LinkedIn.");
  } else {
    console.log("\nDry run complete. Browser left open for inspection.");
    console.log("Press Ctrl+C to exit.");
    await sleep(600_000);
  }

  await page.close();
}

async function main(): Promise<void> {
  const opts = parseOptions();
  const rawInput = readInput(opts.inputPath);

  console.log(`Platform: ${opts.platform}`);
  console.log(`Thread mode: ${opts.thread}`);
  console.log(`Dry run: ${opts.dryRun}`);
  console.log("");

  const ctx = await launchBrowser();

  try {
    if (opts.platform === "twitter") {
      const posts = opts.thread ? splitThread(rawInput) : [rawInput];
      console.log(`${posts.length} tweet(s) to post.\n`);
      await postToTwitter(ctx, posts, opts.dryRun);
    } else {
      if (opts.thread) {
        console.warn(
          "Warning: --thread is ignored for LinkedIn (single post only)."
        );
      }
      await postToLinkedIn(ctx, rawInput, opts.dryRun);
    }

    console.log("\nDone.");
  } catch (err) {
    console.error("Posting failed:", err);
    process.exit(1);
  } finally {
    await ctx.close();
  }
}

main();
