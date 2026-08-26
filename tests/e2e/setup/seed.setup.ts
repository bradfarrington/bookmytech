import { test as setup } from "@playwright/test";
import { adminClient } from "../helpers/supabase";
import { TEST_USERS, type Role } from "../helpers/users";
import { resetOutbox } from "../helpers/outbox";

// Idempotent seed: ensure the three test accounts exist with known passwords and
// roles. Safe to re-run — creates on first run, fixes password/role thereafter.
//
// NOTE: this writes to whatever Supabase project .env.local points at. Point it
// at a dev/staging project, not production.

async function findUserByEmail(admin: ReturnType<typeof adminClient>, email: string) {
  // listUsers is paginated; the test project is small so a couple of pages is plenty.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser(email: string, password: string, role: Role) {
  const admin = adminClient();
  let user = await findUserByEmail(admin, email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
    user = data.user;
  } else {
    // Reset the password so login is deterministic even if the row pre-existed.
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(`updateUser(${email}) failed: ${error.message}`);
  }

  // The handle_new_user trigger creates the profile row with role='customer'.
  // Promote mechanic/admin so role-gated login + proxy let them through.
  if (role !== "customer") {
    const { error } = await admin.from("profiles").update({ role }).eq("id", user.id);
    if (error) throw new Error(`set role ${role} for ${email} failed: ${error.message}`);
  }
}

setup("seed test users + reset outbox", async () => {
  resetOutbox();
  for (const role of Object.keys(TEST_USERS) as Role[]) {
    await ensureUser(TEST_USERS[role].email, TEST_USERS[role].password, role);
  }
});
