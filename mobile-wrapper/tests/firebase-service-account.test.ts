import { createSign } from "node:crypto";
import { describe, expect, it } from "vitest";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function createJwt(account: FirebaseServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri,
    iat: now,
    exp: now + 300,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  return `${header}.${claim}.${signer.sign(account.private_key, "base64url")}`;
}

describe("Firebase service account", () => {
  it("dapat memperoleh token OAuth untuk Firebase Cloud Messaging tanpa mengekspos kredensial", async () => {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(raw, "FIREBASE_SERVICE_ACCOUNT_JSON belum tersedia").toBeTruthy();

    const account = JSON.parse(raw!) as FirebaseServiceAccount;
    expect(account.client_email).toContain("@");
    expect(account.private_key).toContain("BEGIN PRIVATE KEY");
    expect(account.token_uri).toMatch(/^https:\/\//);

    const response = await fetch(account.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: createJwt(account),
      }),
    });
    const body = await response.json() as { access_token?: string };
    expect(response.ok, "Firebase menolak kredensial service account").toBe(true);
    expect(body.access_token).toBeTruthy();
  }, 20000);
});
