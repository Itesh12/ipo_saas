import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const adminEmail = "admin@ipoportal.com";
  const adminPassword = "Admin123!Secure";

  // Check if user exists in auth.users
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const existing = usersData?.users?.find(u => u.email === adminEmail);

  let userId = existing?.id;
  if (!existing) {
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    if (createError) {
      console.error("Failed to create admin:", createError);
      return;
    }
    userId = newUser.user.id;
    console.log("Created admin user:", userId);
  } else {
    // Update password just in case
    await adminClient.auth.admin.updateUserById(userId!, {
      password: adminPassword,
      email_confirm: true,
    });
    console.log("Admin user already exists:", userId);
  }

  // Ensure role is admin in profiles
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      id: userId,
      email: adminEmail,
      role: "admin",
      full_name: "Master Admin",
      updated_at: new Date().toISOString(),
    });

  if (profileError) {
    console.error("Error upserting admin profile:", profileError);
  } else {
    console.log("Admin profile verified and updated to role=admin for:", adminEmail);
  }
}

main().catch(console.error);
