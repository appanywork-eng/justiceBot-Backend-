import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  getAuth,
} from "firebase-admin/auth";

export class FirebaseIdentityError
  extends Error {
  constructor(
    message,
    {
      status = 401,
      code =
        "firebase_identity_error",
    } = {}
  ) {
    super(message);

    this.name =
      "FirebaseIdentityError";

    this.status =
      status;

    this.code =
      code;
  }
}

let cachedAuth = null;

function getProjectId() {
  return String(
    process.env
      .GOOGLE_CLOUD_PROJECT ||
    process.env
      .GCLOUD_PROJECT ||
    process.env
      .FIREBASE_PROJECT_ID ||
    ""
  ).trim();
}

function getFirebaseAuthClient() {
  if (cachedAuth) {
    return cachedAuth;
  }

  const projectId =
    getProjectId();

  const existingApp =
    getApps()[0];

  const app =
    existingApp ||
    initializeApp({
      credential:
        applicationDefault(),

      ...(projectId
        ? {
            projectId,
          }
        : {}),
    });

  cachedAuth =
    getAuth(app);

  return cachedAuth;
}

export function extractBearerToken(
  request
) {
  const authorization =
    String(
      request?.headers
        ?.authorization ||
      ""
    ).trim();

  if (
    !authorization
      .toLowerCase()
      .startsWith(
        "bearer "
      )
  ) {
    return "";
  }

  return authorization
    .slice(7)
    .trim();
}

export async function requireVerifiedFirebaseUser(
  request
) {
  const token =
    extractBearerToken(
      request
    );

  if (!token) {
    throw new FirebaseIdentityError(
      "Verify your email before generating or unlocking a petition.",
      {
        status: 401,
        code:
          "firebase_token_required",
      }
    );
  }

  let decoded;

  try {
    decoded =
      await getFirebaseAuthClient()
        .verifyIdToken(
          token
        );
  } catch {
    throw new FirebaseIdentityError(
      "Your verification session is invalid or has expired. Sign in again.",
      {
        status: 401,
        code:
          "firebase_token_invalid",
      }
    );
  }

  const uid =
    String(
      decoded?.uid ||
      ""
    ).trim();

  const email =
    String(
      decoded?.email ||
      ""
    )
      .trim()
      .toLowerCase();

  const emailVerified =
    decoded
      ?.email_verified ===
    true;

  if (!uid || !email) {
    throw new FirebaseIdentityError(
      "A verified email account is required.",
      {
        status: 401,
        code:
          "firebase_identity_incomplete",
      }
    );
  }

  if (!emailVerified) {
    throw new FirebaseIdentityError(
      "Please verify your email before continuing.",
      {
        status: 403,
        code:
          "firebase_email_unverified",
      }
    );
  }

  return {
    uid,
    email,
    emailVerified: true,

    displayName:
      String(
        decoded?.name ||
        ""
      ).trim(),
  };
}
