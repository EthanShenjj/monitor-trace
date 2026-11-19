import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { createAuthStore } from "../src/lib/authStore.mjs";
import * as authCookies from "../src/lib/authCookies.mjs";

const require = createRequire(import.meta.url);
const sessionSecret = "auth-pages-test-shared-signing-secret";

class Redirect extends Error {
  constructor(location) {
    super(`Redirect to ${location}`);
    this.location = location;
  }
}

// Run the actual server component with request-bound Next APIs supplied by the test.
// Authentication, signatures, user queries, and SQLite writes remain real.
async function loadPage(relativePath, store, token) {
  const filename = new URL(relativePath, import.meta.url);
  const source = await readFile(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const pageModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: pageModule,
    exports: pageModule.exports,
    require(specifier) {
      if (specifier === "next/headers") {
        return { cookies: async () => ({ get: name => name === authCookies.SESSION_COOKIE_NAME && token ? { value: token } : undefined }) };
      }
      if (specifier === "next/navigation") {
        return { redirect: location => { throw new Redirect(location); } };
      }
      if (specifier === "@/lib/authStore.mjs") return { authStore: store };
      if (specifier === "@/lib/authCookies.mjs") return authCookies;
      if (specifier.startsWith("@/components/")) return { default: () => null };
      return require(specifier);
    },
  }, { filename: filename.pathname });
  return pageModule.exports.default;
}

async function withSeparateStores(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "monitor-auth-pages-"));
  const issuer = createAuthStore({ dbPath: path.join(dir, "login.sqlite"), sessionSecret });
  const pageStore = createAuthStore({ dbPath: path.join(dir, "page.sqlite"), sessionSecret });
  try {
    const user = await issuer.registerUser({ name: "Session test", email: "session@example.invalid", password: "test-password-example" });
    const token = issuer.createSessionToken(user.id);
    await run({ pageStore, user, token });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("protected pages accept a valid session issued by another server instance", async () => {
  await withSeparateStores(async ({ pageStore, user, token }) => {
    assert.equal(await pageStore.getUserById(user.id), null);
    const layout = await loadPage("../src/app/(protected)/layout.tsx", pageStore, token);
    await assert.doesNotReject(() => layout({ children: "Dashboard" }));
    assert.equal((await pageStore.getUserById(user.id))?.id, user.id);
  });
});

for (const mode of ["login", "register"]) {
  test(`${mode} page sends a valid cross-instance session to the dashboard`, async () => {
    await withSeparateStores(async ({ pageStore, token }) => {
      const page = await loadPage(`../src/app/${mode}/page.tsx`, pageStore, token);
      await assert.rejects(() => page(), error => error instanceof Redirect && error.location === "/");
    });
  });
}

test("protected pages still reject missing or tampered sessions", async () => {
  await withSeparateStores(async ({ pageStore, user, token }) => {
    for (const invalidToken of [undefined, `${token}tampered`]) {
      const layout = await loadPage("../src/app/(protected)/layout.tsx", pageStore, invalidToken);
      await assert.rejects(() => layout({ children: "Dashboard" }), error => error instanceof Redirect && error.location === "/login");
      assert.equal(await pageStore.getUserById(user.id), null);
    }
  });
});
